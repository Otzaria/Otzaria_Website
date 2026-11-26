import { parseReleaseUrl, LIMITS } from '../policy.js'
import { JobAborted, LeaseLostError, Rejection, operator, transient } from '../errors.js'
import path from 'node:path'
import { DownloadError, RELEASE_HOSTS, fetchAllowlisted, hashBody } from '../httpDownload.js'
import { ensureDir, throwIfAborted } from '../util.js'
import { clamavAssetLabel, clamavIncompleteMessage, clamavPartialOverride, isLimitsSignature } from '../clamavPartial.js'

const TOOL_TIMEOUT_MS = 60 * 60_000

export async function hashesStage(ctx) {
  const files = await ctx.ensureAssets()
  return { files }
}

/** שורות "<path>: <signature> FOUND" של clamscan. */
export function parseClamOutput(stdout) {
  const found = []
  for (const line of String(stdout).split(/\r?\n/)) {
    const m = /^(.*): (\S.*) FOUND$/.exec(line)
    if (m) found.push({ file: m[1], signature: m[2] })
  }
  return found
}

const STDERR_HINT_CHARS = 200

/** סוף ה-stderr בשורה אחת, לאבחון תקלות תפעול (למשל כשל של עטיפת הבידוד). */
export function stderrHint(stderr) {
  const text = String(stderr ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return ` (stderr: ${text.length > STDERR_HINT_CHARS ? `…${text.slice(-STDERR_HINT_CHARS)}` : text})`
}

export async function clamavStage(ctx) {
  await ctx.ensureAssets()
  throwIfAborted(ctx.signal)
  const assets = ctx.assetList()
  const files = assets.map((a) => ctx.localPath(a))
  // --infected מסתיר גם שגיאות. בודקים תוצאה לכל קובץ: exit 1 לבדו אינו מבדיל בין limits לשגיאה בקובץ אחר.
  const args = ['--no-summary', '--stdout', '--alert-exceeds-max=yes', '--max-filesize=512M',
    '--max-scansize=2048M', '--max-files=200000', '--', ...files]
  let r
  try {
    const out = await ensureDir(path.join(ctx.paths.tmpDir, 'clamav'))
    r = await ctx.exec(ctx.config.clamscan, args, { sandbox: { in: ctx.paths.assetsDir, out }, timeoutMs: TOOL_TIMEOUT_MS })
  } catch (err) {
    throwIfAborted(ctx.signal)
    if (err instanceof JobAborted || err instanceof LeaseLostError) throw err
    r = { code: null, stderr: String(err?.message ?? err) }
  }
  // ביטול משימה ו-lease אבוד לעולם אינם הרשאה להמשיך, אפילו כשיש override מלא.
  throwIfAborted(ctx.signal)
  if (r.aborted) throw transient('clamav_aborted', 'סריקת ClamAV נעצרה')

  const byFile = new Map(assets.map((a) => [ctx.localPath(a), a]))
  const describe = (f) => ({ key: byFile.get(f.file)?.key ?? null, signature: f.signature })
  const found = parseClamOutput(r.stdout)
  const detections = found.filter((f) => !isLimitsSignature(f.signature)).map(describe)
  const incomplete = found.filter((f) => isLimitsSignature(f.signature)).map(describe)
  const completed = new Set(found.filter((f) => byFile.has(f.file)).map((f) => byFile.get(f.file).key))
  const clean = []
  const errors = []
  for (const line of String(r.stdout ?? '').split(/\r?\n/)) {
    const ok = /^(.*): OK$/.exec(line)
    if (ok && byFile.has(ok[1])) {
      clean.push(byFile.get(ok[1]).key)
      completed.add(byFile.get(ok[1]).key)
    }
    const error = /^(.*): (.+) ERROR$/.exec(line)
    if (error) errors.push({ key: byFile.get(error[1])?.key ?? null, message: error[2].slice(0, 500) })
  }
  const unverified = assets.filter((a) => !completed.has(a.key)).map((a) => a.key)
  const errorOutput = /(?:^|\n)(?:LibClamAV )?ERROR[: ]|LibClamAV Error:/i.test(`${r.stdout ?? ''}\n${r.stderr ?? ''}`)
  const issue = r.spawnError ? ['clamav_unavailable', 'ClamAV אינו מותקן או אינו זמין בשרת הבדיקה']
    : r.timedOut ? ['clamav_timeout', 'סריקת ClamAV חרגה מזמן ההמתנה']
      : ![0, 1].includes(r.code) || errors.length || errorOutput ? ['clamav_error', `סריקת ClamAV נכשלה (קוד ${r.code}); לא כל הקבצים נבדקו בהצלחה`]
        : r.stdoutTruncated || unverified.length || found.some((f) => !byFile.has(f.file)) || (r.code === 1 && !found.length) || (r.code === 0 && found.length)
          ? ['clamav_output_unparsed', 'לא התקבלה תוצאת ClamAV מלאה ומזוהה לכל הקבצים'] : null
  if (!issue && !found.length && r.code === 0) return { status: 'clean', scanned: clean }

  const label = (key) => clamavAssetLabel(assets.find((a) => a.key === key))
  const diagnosticLines = [issue?.[1] ?? (detections.length ? 'ClamAV זיהה חתימות חשודות' : 'סריקת ClamAV חלקית'),
    ...detections.map((i) => `- ${label(i.key)}: ${i.signature.slice(0, 200)}`),
    ...incomplete.map((i) => `- ${label(i.key)}: ${i.signature.slice(0, 200)}`),
    ...errors.map((i) => `- ${label(i.key)}: ${i.message}`),
    ...(unverified.length ? [`קבצים ללא תוצאת סריקה מאומתת: ${unverified.map(label).join('; ')}`] : []),
    ...(r.stderr ? [stderrHint(r.stderr)] : [])]
  const maxChars = LIMITS.errorMessageChars ?? LIMITS.reasonChars
  const diagnosticText = diagnosticLines.join('\n')
  const diagnosticMessage = diagnosticText.length <= maxChars ? diagnosticText : `${diagnosticText.slice(0, maxChars - 16)}… (הפלט קוצר)`
  const bounded = (items) => items.slice(0, 16).map((i) => ({ ...i, signature: i.signature.slice(0, 200) }))
  const data = { outcome: detections.length ? 'detected' : issue ? 'error' : 'partial',
    detections: bounded(detections), incomplete: bounded(incomplete), unverified, clean: [...new Set(clean)], errors: errors.slice(0, 16), diagnosticMessage,
    ...(detections.length > 16 || incomplete.length > 16 || errors.length > 16 ? { detailsTruncated: true } : {}),
    ...(issue ? { issue: { code: issue[0], message: diagnosticMessage } } : {}) }
  const override = clamavPartialOverride(ctx.job)
  if (override?.scope === 'all_results') {
    // ההרשאה החדשה מפורשת לכל תוצאת ClamAV; סיבת המנהל נשארת באתר, מחוץ לדוח ולקבלה.
    return { status: 'overridden', ...data, override: { scope: override.scope, grantedAt: override.grantedAt } }
  }
  if (detections.length) {
    const lines = detections.map((f) => `- ${clamavAssetLabel(assets.find((a) => a.key === f.key))}: ${f.signature}`)
    throw new Rejection('clamav', `סורק הנוזקות ClamAV זיהה חתימה מוכרת:\n${lines.join('\n')}`,
      data)
  }
  if (issue) {
    const message = diagnosticMessage
    if (issue[0] === 'clamav_timeout') throw transient(issue[0], message)
    throw operator(issue[0], message, data)
  }
  // חריגה ישנה שהוגדרה ל-limits בלבד אינה מורחבת בדיעבד לשגיאה או לזיהוי.
  if (override && incomplete.length && incomplete.every((i) => i.key !== null)) {
    return { status: 'partial', incomplete, override: { grantedAt: override.grantedAt } }
  }
  const described = incomplete.map((i) => ({ ...i, label: clamavAssetLabel(assets.find((a) => a.key === i.key)) }))
  throw operator('clamav_incomplete', clamavIncompleteMessage(described, assets.length), data)
}

/** כל מתקין חייב להיות זהה בדיוק לקובץ ה-Release הציבורי שהוצהר. */
export async function releaseStage(ctx) {
  const sources = new Set(ctx.job.submission.sources.map((s) => s.repository.toLowerCase()))
  const checked = []
  for (const asset of ctx.job.assets) {
    const parsed = parseReleaseUrl(asset.releaseUrl)
    if (!parsed || !sources.has(`${parsed.owner}/${parsed.repo}`.toLowerCase())) {
      throw new Rejection('release', `קישור ה-Release של ${asset.name} אינו קישור הורדה של GitHub מאחד ממאגרי המקור שהוגשו.`)
    }
    let result
    try {
      const res = await fetchAllowlisted(asset.releaseUrl, { hosts: RELEASE_HOSTS, signal: ctx.signal, fetchImpl: ctx.fetch,
        headers: { 'user-agent': 'otzaria-service-broker', accept: 'application/octet-stream' } })
      result = await hashBody(res, asset.size)
    } catch (err) {
      if (!(err instanceof DownloadError)) throw err
      if (err.code === 'not_found') {
        throw new Rejection('release', `קובץ ה-Release של ${asset.name} לא נמצא בכתובת שהוצהרה (${asset.releaseUrl}).`)
      }
      if (err.code === 'too_large') {
        throw new Rejection('release', `קובץ ה-Release של ${asset.name} גדול מהקובץ שהועלה לחנות — הקבצים אינם זהים.`)
      }
      if (err.code === 'host_not_allowed' || err.code === 'url_not_allowed') {
        throw new Rejection('release', `קישור ה-Release של ${asset.name} מפנה לכתובת שאינה של GitHub.`)
      }
      throw transient('release_fetch_failed', `הורדת קובץ ה-Release של ${asset.name} נכשלה זמנית`)
    }
    if (result.size !== asset.size || result.sha256 !== asset.sha256) {
      throw new Rejection('release', `קובץ ה-Release של ${asset.name} אינו זהה לקובץ שהועלה לחנות (SHA-256 שונה).`,
        { key: asset.key, releaseSha256: result.sha256 })
    }
    checked.push({ key: asset.key, releaseUrl: asset.releaseUrl, sha256: result.sha256 })
  }
  return { status: 'match', checked }
}

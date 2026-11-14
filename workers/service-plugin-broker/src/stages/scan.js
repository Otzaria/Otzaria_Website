import { parseReleaseUrl } from '../policy.js'
import { Rejection, operator, transient } from '../errors.js'
import path from 'node:path'
import { DownloadError, RELEASE_HOSTS, fetchAllowlisted, hashBody } from '../httpDownload.js'
import { ensureDir } from '../util.js'

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

export async function clamavStage(ctx) {
  await ctx.ensureAssets()
  const assets = ctx.assetList()
  const files = assets.map((a) => ctx.localPath(a))
  const args = ['--no-summary', '--stdout', '--infected', '--alert-exceeds-max=yes', '--max-filesize=512M',
    '--max-scansize=2048M', '--max-files=200000', '--', ...files]
  const out = await ensureDir(path.join(ctx.paths.tmpDir, 'clamav'))
  const r = await ctx.exec(ctx.config.clamscan, args, { sandbox: { in: ctx.paths.assetsDir, out }, timeoutMs: TOOL_TIMEOUT_MS })
  if (r.spawnError) throw operator('clamav_unavailable', 'ClamAV אינו מותקן או אינו זמין בשרת הבדיקה')
  if (r.timedOut) throw transient('clamav_timeout', 'סריקת ClamAV חרגה מזמן ההמתנה')
  if (r.aborted) throw transient('clamav_aborted', 'סריקת ClamAV נעצרה')
  if (r.code === 0) return { status: 'clean', scanned: assets.map((a) => a.key) }
  if (r.code !== 1) throw operator('clamav_error', `ClamAV החזיר שגיאה (קוד ${r.code}) — הסריקה לא הושלמה`)

  const byFile = new Map(assets.map((a) => [ctx.localPath(a), a]))
  const found = parseClamOutput(r.stdout)
  const incomplete = found.filter((f) => f.signature.startsWith('Heuristics.Limits.Exceeded'))
  const real = found.filter((f) => !f.signature.startsWith('Heuristics.Limits.Exceeded'))
  if (real.length) {
    const lines = real.map((f) => {
      const a = byFile.get(f.file)
      return `- ${a ? (a.isPlugin ? 'קובץ התוסף' : `המתקין ${a.name}`) : 'קובץ בהגשה'}: ${f.signature}`
    })
    throw new Rejection('clamav', `סורק הנוזקות ClamAV זיהה חתימה מוכרת:\n${lines.join('\n')}`,
      { detections: real.map((f) => ({ key: byFile.get(f.file)?.key ?? null, signature: f.signature })) })
  }
  if (incomplete.length || !found.length) {
    throw operator('clamav_incomplete', 'סריקת ClamAV לא הושלמה (חריגה ממגבלות הסורק) — סריקה חלקית אינה "נקי"')
  }
  return { status: 'clean' }
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

import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { Rejection, operator, transient } from '../errors.js'
import { killTree } from '../process.js'
import { ensureDir, removeDir, sha256File, throwIfAborted } from '../util.js'

export const EXTRACT_LIMITS = Object.freeze({ maxBytes: 2 * 1024 * 1024 * 1024, maxEntries: 200_000, maxDepth: 3 })
const SEVEN_ZIP_TIMEOUT_MS = 30 * 60_000
const OUTPUT_POLL_MS = 500
const CONTAINER_RE = /\.(?:tar|gz|tgz|xz|txz|bz2|tbz|tbz2|zst|lzma|cpio|hfs|hfsx|dmg|pkg|cab|img|apfs|squashfs|zip|7z|msi|apk|deb|rpm|appimage|exe|nupkg|xar)$/i
const CONTAINER_NAMES = new Set(['payload', 'payload~', 'content', 'data'])

/** פענוח `7z l -slt`: סוג הארכיון ורשימת הרשומות עם גודל. */
export function parseSevenZipList(stdout) {
  const lines = String(stdout).split(/\r?\n/)
  const sep = lines.indexOf('----------')
  const headStart = lines.indexOf('--')
  const props = {}
  for (const line of lines.slice(headStart === -1 ? 0 : headStart + 1, sep === -1 ? lines.length : sep)) {
    const m = /^([^=]+?) = (.*)$/.exec(line)
    if (m) props[m[1]] = m[2]
  }
  const entries = []
  let cur = null
  for (const line of sep === -1 ? [] : lines.slice(sep + 1)) {
    if (!line.trim()) {
      if (cur) entries.push(cur)
      cur = null
      continue
    }
    const m = /^([^=]+?) = ?(.*)$/.exec(line)
    if (!m) continue
    cur ??= {}
    cur[m[1]] = m[2]
  }
  if (cur) entries.push(cur)
  return {
    type: props.Type ?? null,
    entries: entries.filter((e) => e.Path !== undefined).map((e) => ({
      path: e.Path,
      isDir: e.Folder === '+' || /^D/.test(e.Attributes ?? ''),
      size: e.Size === undefined || e.Size === '' ? null : Number(e.Size),
    })),
  }
}

/** סימני זיהוי לפורמטים ש-7-Zip אינו פותח (לדוח בלבד). */
export async function detectUnsupportedInstaller(file) {
  const markers = [
    { name: 'Inno Setup', bytes: Buffer.from('Inno Setup Setup Data') },
    { name: 'WiX Burn', bytes: Buffer.from('.wixburn') },
  ]
  const found = new Set()
  let tail = Buffer.alloc(0)
  for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    const buf = Buffer.concat([tail, chunk])
    for (const m of markers) if (buf.includes(m.bytes)) found.add(m.name)
    tail = buf.subarray(Math.max(0, buf.length - 64))
  }
  return [...found]
}

async function walk(root, budget) {
  const files = []
  const skipped = []
  const stack = ['']
  while (stack.length) {
    const rel = stack.pop()
    const entries = await readdir(path.join(root, rel), { withFileTypes: true })
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      budget.entries--
      if (budget.entries < 0) throw new Rejection('extract', 'המתקין מכיל יותר מדי קבצים לחילוץ בטוח.')
      const st = await lstat(path.join(root, childRel))
      if (st.isSymbolicLink()) skipped.push(childRel)
      else if (st.isDirectory()) stack.push(childRel)
      else if (st.isFile()) {
        budget.bytes -= st.size
        if (budget.bytes < 0) throw new Rejection('extract', 'התוכן המחולץ מהמתקין חורג ממגבלת הגודל לחילוץ בטוח.')
        files.push({ rel: childRel, abs: path.join(root, childRel), size: st.size })
      } else skipped.push(childRel)
    }
  }
  return { files, skipped }
}

/** נפח ומספר רשומות בתיקייה (בלי לעקוב אחרי קישורים); רשומה שנעלמה באמצע אינה שגיאה. */
async function dirUsage(root) {
  const usage = { bytes: 0, entries: 0 }
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      usage.entries++
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(abs)
      else if (e.isFile()) usage.bytes += (await lstat(abs).catch(() => ({ size: 0 }))).size
    }
  }
  return usage
}

/**
 * הפעלת 7-Zip בבידוד: {in} הוא הארכיון ו-{out} תיקיית הפלט של ההפעלה הזו בלבד.
 * `watch`: הגודל המוצהר (למשל ISIZE של gzip) אינו אמין, ולכן הפלט נמדד תוך כדי החילוץ ונעצר בחריגה.
 */
async function sevenZip(ctx, args, io, watch = null) {
  let timer = null
  let overflow = false
  let busy = false
  const onSpawn = watch && ((child) => {
    timer = setInterval(async () => {
      if (busy || overflow) return
      busy = true
      const u = await dirUsage(watch.dir)
      busy = false
      if (u.bytes > watch.budget.bytes || u.entries > watch.budget.entries) {
        overflow = true
        killTree(child, 1000)
      }
    }, ctx.config.extractPollMs ?? OUTPUT_POLL_MS)
  })
  let r
  try {
    r = await ctx.exec(ctx.config.sevenZip, args, { sandbox: io, timeoutMs: SEVEN_ZIP_TIMEOUT_MS, maxStdoutBytes: 64 * 1024 * 1024,
      onSpawn: onSpawn || undefined })
  } finally {
    clearInterval(timer)
  }
  if (overflow) {
    throw new Rejection('extract', 'התוכן שחולץ בפועל מהמתקין חורג ממגבלת הגודל לחילוץ בטוח, אף שהגודל המוצהר בארכיון קטן יותר. החילוץ נעצר.')
  }
  if (r.spawnError) throw operator('seven_zip_unavailable', '7-Zip אינו מותקן או אינו זמין בשרת הבדיקה')
  if (r.timedOut) throw transient('seven_zip_timeout', 'חילוץ 7-Zip חרג מזמן ההמתנה')
  if (r.aborted) throw transient('seven_zip_aborted', 'חילוץ 7-Zip נעצר')
  if (r.stdoutTruncated) throw new Rejection('extract', 'רשימת התוכן של המתקין ארוכה מדי לחילוץ בטוח.')
  return r
}

/**
 * חילוץ ארכיון אחד: רשימה תחילה (בדיקת מגבלות לפני כתיבה לדיסק), ואז `7z x` לתיקייה ייעודית.
 * @returns {Promise<{ok:boolean, type?:string|null}>}
 */
async function extractOne(ctx, archive, outDir, budget, strict) {
  const listOut = await ensureDir(path.join(ctx.paths.tmpDir, 'list'))
  const list = await sevenZip(ctx, ['l', '-slt', '-bd', '--', archive], { in: archive, out: listOut })
  if (list.code !== 0 && list.code !== 1) return { ok: false }
  const parsed = parseSevenZipList(list.stdout)
  let declared = 0
  for (const e of parsed.entries) {
    if (e.isDir) continue
    if (e.size === null || !Number.isFinite(e.size)) {
      if (!strict) return { ok: false, type: parsed.type }
      throw new Rejection('extract', 'לא ניתן לקבוע מראש את גודל התוכן במתקין, ולכן לא חולץ.')
    }
    declared += e.size
  }
  if (parsed.entries.length > budget.entries || declared > budget.bytes) {
    throw new Rejection('extract', 'התוכן המוצהר במתקין חורג ממגבלות החילוץ הבטוח (גודל או מספר קבצים).')
  }
  await ensureDir(outDir)
  const x = await sevenZip(ctx, ['x', '-y', '-bd', `-o${outDir}`, '--', archive], { in: archive, out: outDir }, { dir: outDir, budget })
  if (x.code !== 0 && x.code !== 1) return { ok: false, type: parsed.type }
  return { ok: true, type: parsed.type }
}

const lowerPath = (p) => p.replace(/\\/g, '/').toLowerCase()

function isContainer(rel) {
  const base = path.posix.basename(lowerPath(rel))
  return CONTAINER_RE.test(base) || CONTAINER_NAMES.has(base)
}

/**
 * מחלץ מתקין אחד (עד 3 שכבות מקוננות, למשל DMG/PKG/DEB) ומחפש את bundledPluginPath.
 * @returns {Promise<{status:'match'|'mismatch'|'not_found'|'not_extractable', ...}>}
 */
export async function locateBundledPlugin(ctx, asset, file, plugin) {
  const root = path.join(ctx.paths.extractDir, asset.key)
  await removeDir(root)
  const limits = ctx.config.extractLimits ?? EXTRACT_LIMITS
  const budget = { bytes: limits.maxBytes, entries: limits.maxEntries }
  const want = lowerPath(asset.bundledPluginPath)
  const allFiles = []
  let queue = [{ archive: file, out: path.join(root, 'L0') }]
  let firstType = null
  let matches = []
  for (let depth = 0; depth <= EXTRACT_LIMITS.maxDepth && queue.length && !matches.length; depth++) {
    const next = []
    for (const item of queue) {
      throwIfAborted(ctx.signal)
      const r = await extractOne(ctx, item.archive, item.out, budget, depth === 0)
      if (depth === 0) {
        firstType = r.type ?? null
        if (!r.ok) return { status: 'not_extractable', type: firstType }
      }
      if (!r.ok) continue
      const { files } = await walk(item.out, budget)
      allFiles.push(...files)
      for (const f of files) {
        const rel = lowerPath(f.rel)
        if (rel === want || rel.endsWith(`/${want}`)) matches.push(f)
        else if (depth < EXTRACT_LIMITS.maxDepth && isContainer(f.rel)) {
          next.push({ archive: f.abs, out: path.join(root, `L${depth + 1}`, String(next.length)) })
        }
      }
    }
    queue = next
  }
  for (const f of matches) {
    const h = await sha256File(f.abs)
    if (h.sha256 === plugin.sha256 && h.size === plugin.size) return { status: 'match', path: f.rel, type: firstType }
  }
  if (matches.length) return { status: 'mismatch', path: matches[0].rel, type: firstType }
  // שמות פנימיים (למשל טבלת הקבצים של MSI) עשויים להיות שונים מהנתיב המוצהר — חיפוש לפי תוכן זהה בלבד.
  for (const f of allFiles) {
    if (f.size !== plugin.size) continue
    const h = await sha256File(f.abs)
    if (h.sha256 === plugin.sha256) return { status: 'match', path: f.rel, type: firstType, byContent: true }
  }
  return { status: 'not_found', type: firstType }
}

export async function extractStage(ctx) {
  await ctx.ensureAssets()
  const plugin = ctx.assetList().find((a) => a.isPlugin)
  const results = []
  try {
    for (const asset of ctx.job.assets) {
      const file = ctx.localPath(asset)
      const r = await locateBundledPlugin(ctx, asset, file, plugin)
      if (r.status === 'match') {
        results.push({ key: asset.key, foundAt: r.path, byContent: Boolean(r.byContent), archiveType: r.type })
        continue
      }
      const unsupported = await detectUnsupportedInstaller(file)
      const hint = unsupported.length
        ? ` זוהה מתקין ${unsupported.join(' / ')}, ש-7-Zip אינו פותח. יש לארוז ב-NSIS, MSI או ZIP.`
        : ''
      const reason = {
        not_extractable: `לא ניתן לחלץ סטטית את המתקין ${asset.name} באמצעות 7-Zip.${hint}`,
        not_found: `התוסף לא נמצא בנתיב ${asset.bundledPluginPath} בתוך המתקין ${asset.name}.${hint}`,
        mismatch: `הקובץ ${asset.bundledPluginPath} שבתוך המתקין ${asset.name} אינו זהה לתוסף העצמאי שהוגש.`,
      }[r.status]
      throw new Rejection('extract', reason, { key: asset.key, status: r.status, unsupported })
    }
  } finally {
    await removeDir(ctx.paths.extractDir)
  }
  return { status: 'match', results }
}

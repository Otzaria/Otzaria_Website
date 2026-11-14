import { createHash } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { LIMITS } from './policy.js'
import { TARBALL_HOSTS, fetchAllowlisted, limitStream } from './httpDownload.js'
import { TarError, readTarGz } from './tar.js'
import { unifiedDiff } from './diff.js'
import { classifyPath, isCodeLikePath } from './prescan.js'
import { ensureDir, escapeForList, exists, formatBytes } from './util.js'

export const SOURCE_FETCH_LIMITS = Object.freeze({
  maxCompressedBytes: 512 * 1024 * 1024,
  maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
  maxEntries: 200_000,
})
const DIFF_TOTAL_BYTES = 6 * 1024 * 1024
const DIFF_FILE_BYTES = 256 * 1024
// מגבלת GitHub לעץ רקורסיבי היא 7MB; התקרה כאן רק מגינה מתגובה חריגה.
const TREE_MAX_BYTES = 32 * 1024 * 1024
const GITHUB_API_HEADERS = Object.freeze({ accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
  'user-agent': 'otzaria-service-broker' })
const LFS_POINTER = Buffer.from('version https://git-lfs.github.com/spec/v1')

/** חריגה ממגבלות המקור — דחייה, לא אישור חלקי. */
export class SourceLimitError extends Error {
  constructor(reasonHe) {
    super(reasonHe)
    this.name = 'SourceLimitError'
  }
}

export class SourceFormatError extends Error {
  constructor(reasonHe) {
    super(reasonHe)
    this.name = 'SourceFormatError'
  }
}

/** טקסט = ללא NUL וכמעט ללא תווי בקרה. נבדק על התוכן המלא או על 8KiB הראשונים. */
export function looksLikeText(buf) {
  if (!buf?.length) return true
  let control = 0
  for (const b of buf) {
    if (b === 0) return false
    if (b < 0x20 && b !== 9 && b !== 10 && b !== 13 && b !== 12 && b !== 11 && b !== 27) control++
  }
  return control / buf.length < 0.01
}

export const gitBlobSha1 = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex')

/** UTF-16 עם BOM → מחרוזת, או null כשאין BOM או שהתוכן אינו טקסט. */
export function decodeUtf16(buf) {
  if (!buf || buf.length < 2) return null
  const le = buf[0] === 0xff && buf[1] === 0xfe
  const be = buf[0] === 0xfe && buf[1] === 0xff
  if (!(le || be) || buf.length % 2) return null
  const body = Buffer.from(buf.subarray(2))
  if (be) body.swap16()
  const text = body.toString('utf16le')
  let control = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 0) return null
    if (c < 0x20 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 11 && c !== 27) control++
  }
  return text.length && control / text.length >= 0.01 ? null : text
}

const hasUtf16Bom = (buf) => buf?.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))
const foldPath = (p) => p.normalize('NFC').toLowerCase()

/**
 * אוסף רשומות tar של כל המקורות לאינדקס אחד ומספר קבצי טקסט. מגבלות LIMITS.source* משותפות לכל המקורות.
 */
export class SourceCollector {
  constructor(filesDir, limits = LIMITS) {
    this.filesDir = filesDir
    this.limits = limits
    this.rows = []
    this.textFiles = 0
    this.textBytes = 0
    this.binaryFiles = 0
    this.folded = new Map()
  }

  /** נתיבים שזהים אחרי נרמול NFC והתעלמות מרישיות (כולל תיקיות אב) היו מתנגשים במערכת קבצים של מפתח או runner. */
  #checkCollision(display, isDirectory) {
    const parts = display.split('/')
    for (let i = 2; i <= parts.length; i++) {
      const exact = parts.slice(0, i).join('/')
      const key = foldPath(exact)
      const prev = this.folded.get(key)
      const dir = i < parts.length || isDirectory
      if (prev && (prev.exact !== exact || (!dir && !prev.dir) || prev.dir !== dir)) {
        throw new SourceFormatError(`הנתיבים ${escapeForList(prev.exact)} ו-${escapeForList(exact)} מתנגשים (רישיות או נרמול Unicode) — לא ברור איזה מהם נבנה`)
      }
      if (!prev) this.folded.set(key, { exact, dir })
    }
  }

  async add(repository, entry, root) {
    if (!entry.path) return
    const [first, ...rest] = entry.path.split('/')
    if (first !== root) throw new SourceFormatError('ארכיון המקור אינו במבנה הצפוי של GitHub (תיקיית שורש אחת)')
    if (!rest.length) return
    const rel = rest.join('/')
    const display = `${repository}/${rel}`
    this.#checkCollision(display, entry.type === 'directory')
    if (entry.type === 'directory') return
    if (entry.type !== 'file') {
      const kind = entry.type === 'chardev' || entry.type === 'blockdev' || entry.type === 'fifo' ? 'device' : entry.type
      this.rows.push({ n: null, path: display, size: entry.size, sha256: null, kind, linkname: entry.linkname || null })
      return
    }
    const sample = entry.content ?? entry.head
    if (sample?.subarray(0, LFS_POINTER.length).equals(LFS_POINTER)) {
      throw new SourceFormatError(`הקובץ ${escapeForList(display)} הוא מצביע Git LFS: התוכן שנבנה אינו נמצא בארכיון ולא ניתן לסקור אותו`)
    }
    let content = entry.content
    let encoding = null
    if (hasUtf16Bom(sample)) {
      if (!content) throw new SourceLimitError(`קובץ הטקסט ${escapeForList(display)} גדול מ-${formatBytes(this.limits.sourceFileBytes)}`)
      const decoded = decodeUtf16(content)
      if (decoded !== null) {
        content = Buffer.from(decoded, 'utf8')
        encoding = sample[0] === 0xff ? 'utf-16le' : 'utf-16be'
      }
    }
    const text = encoding ? true : content ? looksLikeText(content) : looksLikeText(entry.head)
    if (!text && isCodeLikePath(rel)) {
      throw new SourceFormatError(`הקובץ ${escapeForList(display)} הוא קובץ קוד, בנייה או תלויות, אך תוכנו אינו טקסט שניתן לסקור (קידוד לא נתמך או תווים בינאריים). יש לשמור אותו כ-UTF-8 או UTF-16 עם BOM.`)
    }
    if (!text) {
      this.binaryFiles++
      this.rows.push({ n: null, path: display, size: entry.size, sha256: entry.sha256, kind: 'binary' })
      return
    }
    if (entry.size > this.limits.sourceFileBytes) {
      throw new SourceLimitError(`קובץ הטקסט ${escapeForList(display)} גדול מ-${formatBytes(this.limits.sourceFileBytes)}`)
    }
    this.textFiles++
    this.textBytes += entry.size
    if (this.textFiles > this.limits.sourceTextFiles) {
      throw new SourceLimitError(`במקור יש יותר מ-${this.limits.sourceTextFiles} קובצי טקסט`)
    }
    if (this.textBytes > this.limits.sourceTextBytes) {
      throw new SourceLimitError(`נפח קובצי הטקסט במקור עולה על ${formatBytes(this.limits.sourceTextBytes)}`)
    }
    const n = this.textFiles
    // שם מספרי בלבד: קבצים כמו CLAUDE.md או .mcp.json מהמאגר אינם הופכים להגדרות של הבודק.
    await writeFile(path.join(this.filesDir, `${n}.txt`), content, { mode: 0o640 })
    this.rows.push({ n, path: display, size: entry.size, sha256: entry.sha256, kind: 'text', ...(encoding ? { encoding } : {}) })
  }
}

/** העץ המלא של ה-commit (`git/trees?recursive=1`). עץ קטוע אינו מאפשר השוואה מלאה ולכן נדחה. */
export async function fetchGitTree({ repository, commit, signal, fetchImpl, maxBytes = TREE_MAX_BYTES }) {
  const url = `https://api.github.com/repos/${repository}/git/trees/${commit}?recursive=1`
  const res = await fetchAllowlisted(url, { hosts: TARBALL_HOSTS, signal, fetchImpl, headers: GITHUB_API_HEADERS })
  const chunks = []
  for await (const chunk of limitStream(res.body, maxBytes)) chunks.push(chunk)
  let tree
  try {
    tree = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    tree = null
  }
  if (!Array.isArray(tree?.tree)) throw new SourceFormatError('עץ הקבצים של ה-commit שהתקבל מ-GitHub אינו תקין')
  if (tree.truncated !== false) {
    throw new SourceFormatError('עץ הקבצים של ה-commit גדול ממה ש-GitHub מחזיר במלואו, ולכן לא ניתן לוודא שהארכיון שנסקר זהה לקוד שנבנה')
  }
  return tree.tree
}

/**
 * הארכיון של GitHub מכבד export-ignore/export-subst ואינו כולל submodules, בעוד actions/checkout בונה את העץ המלא.
 * @returns {string|null} סיבת דחייה בעברית, או null כשהארכיון זהה לעץ
 */
export function treeMismatch(treeEntries, archived) {
  const blobs = new Map()
  for (const e of treeEntries) {
    if (e?.type === 'commit') {
      return `המאגר מכיל submodule (${escapeForList(e.path)}). תוכן submodule אינו נכלל בארכיון שנסקר אך נבנה בפועל — יש להכליל את הקוד במאגר עצמו.`
    }
    if (e?.type === 'blob' && typeof e.path === 'string') blobs.set(e.path, e)
  }
  for (const [p, blob] of blobs) {
    const a = archived.get(p)
    if (!a) return `הקובץ ${escapeForList(p)} קיים ב-commit אך חסר בארכיון המקור של GitHub (למשל export-ignore ב-.gitattributes). הקוד שנסקר חייב להיות זהה לקוד שנבנה.`
    if ((blob.mode === '120000') !== (a.type === 'symlink')) return `סוג הרשומה ${escapeForList(p)} בארכיון אינו תואם ל-commit.`
    if (a.gitSha1 !== blob.sha) {
      return `תוכן הקובץ ${escapeForList(p)} בארכיון שונה מתוכנו ב-commit (למשל export-subst ב-.gitattributes). הקוד שנסקר חייב להיות זהה לקוד שנבנה.`
    }
  }
  for (const p of archived.keys()) {
    if (!blobs.has(p)) return `הרשומה ${escapeForList(p)} בארכיון אינה קיימת ב-commit.`
  }
  return null
}

/** מוריד tarball של commit מדויק דרך ה-API של GitHub (ללא git, ללא hooks), מזין את האוסף ומשווה לעץ ה-commit. */
export async function collectSource({ repository, commit, collector, signal, fetchImpl, limits = SOURCE_FETCH_LIMITS }) {
  const tree = await fetchGitTree({ repository, commit, signal, fetchImpl })
  const early = treeMismatch(tree.filter((e) => e?.type === 'commit'), new Map())
  if (early) throw new SourceFormatError(early)
  const url = `https://api.github.com/repos/${repository}/tarball/${commit}`
  const res = await fetchAllowlisted(url, { hosts: TARBALL_HOSTS, signal, fetchImpl, headers: GITHUB_API_HEADERS })
  let root = null
  const archived = new Map()
  const result = await readTarGz(limitStream(res.body, limits.maxCompressedBytes), {
    limits: { maxUncompressedBytes: limits.maxUncompressedBytes, maxEntries: limits.maxEntries, maxBufferBytes: collector.limits.sourceFileBytes },
    onEntry: async (entry) => {
      if (!entry.path) return
      if (root === null) root = entry.path.split('/')[0]
      await collector.add(repository, entry, root)
      const rel = entry.path.split('/').slice(1).join('/')
      if (!rel || entry.type === 'directory') return
      const gitSha1 = entry.type === 'file' ? entry.gitSha1 : entry.type === 'symlink' ? gitBlobSha1(Buffer.from(entry.linkname, 'utf8')) : null
      archived.set(rel, { type: entry.type, gitSha1 })
    },
  })
  const comment = result.globalPax?.comment
  if (comment && comment !== commit) throw new SourceFormatError('ה-commit בארכיון שהתקבל מ-GitHub אינו תואם ל-commit שהוגש')
  const mismatch = treeMismatch(tree, archived)
  if (mismatch) throw new SourceFormatError(mismatch)
  return { entries: result.entries, uncompressedBytes: result.uncompressedBytes }
}

export function formatIndex(rows) {
  const lines = [
    '# INDEX — מיפוי מספר קובץ לנתיב המקורי. קובצי טקסט נמצאים ב-files/<מספר>.txt.',
    '# עמודות: מספר | סוג | גודל | sha256 | נתיב (או יעד הקישור)',
  ]
  for (const r of rows) {
    const target = r.linkname ? ` -> ${escapeForList(r.linkname)}` : ''
    lines.push([r.n ?? '-', r.encoding ? `${r.kind}(${r.encoding})` : r.kind, r.size, r.sha256 ?? '-', escapeForList(r.path) + target].join('\t'))
  }
  return lines.join('\n') + '\n'
}

export async function writeSnapshot(snapshotDir, rows, meta) {
  await writeFile(path.join(snapshotDir, 'index.json'), JSON.stringify({ ...meta, rows }), { mode: 0o640 })
}

export async function readSnapshot(snapshotDir) {
  const file = path.join(snapshotDir, 'index.json')
  if (!(await exists(file))) return null
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/** מעתיק קובצי טקסט מתמונת המקור לתיקיית הסקירה. */
export async function copyTextFiles(rows, fromDir, toDir) {
  await ensureDir(toDir)
  for (const r of rows) {
    if (r.n) await copyFile(path.join(fromDir, `${r.n}.txt`), path.join(toDir, `${r.n}.txt`))
  }
}

/**
 * השוואה לתמונת המקור המאושרת הקודמת: נוספו/הוסרו/שונו (כולל בינאריים ותלויות) ו-diff מאוחד מוגבל.
 * @param {{rows:object[], dir:string}|null} previous
 */
export async function buildDiffText({ previous, current, previousLabel }) {
  if (!previous) {
    return [
      '# DIFF — אין תמונת מקור קודמת מאושרת בבודק.',
      '# זוהי סקירה מלאה: אין להניח ש"אין שינויים". יש לציין זאת בדוח תחת מגבלות.',
      '',
    ].join('\n')
  }
  const prevByPath = new Map(previous.rows.map((r) => [r.path, r]))
  const curByPath = new Map(current.rows.map((r) => [r.path, r]))
  const added = current.rows.filter((r) => !prevByPath.has(r.path))
  const removed = previous.rows.filter((r) => !curByPath.has(r.path))
  const changed = current.rows.filter((r) => {
    const p = prevByPath.get(r.path)
    return p && (p.sha256 !== r.sha256 || p.kind !== r.kind || (p.linkname ?? null) !== (r.linkname ?? null))
  })
  const tag = (r) => {
    const cats = classifyPath(r.path)
    return cats.length ? ` [${cats.join(',')}]` : ''
  }
  const fileRef = (r) => (r.n ? `files/${r.n}.txt` : r.kind)
  const lines = [
    `# DIFF — השוואה לתמונת המקור של ההגשה המאושרת הקודמת (${previousLabel}).`,
    `# נוספו: ${added.length}, הוסרו: ${removed.length}, שונו: ${changed.length}.`,
    '# [workflow]/[build]/[dependency]/[git] מסמנים קובצי בנייה, תלויות והגדרות git.',
    "# שורות התוכן ב-diff מתחילות בסימן (' ', '-', '+') ואחריו רווח; תווים בלתי נראים מוצגים כ-\\uXXXX.",
    '',
    '## נוספו',
    ...added.map((r) => `+ ${escapeForList(r.path)}\t${fileRef(r)}${tag(r)}`),
    '',
    '## הוסרו',
    ...removed.map((r) => `- ${escapeForList(r.path)}\t${r.kind}${tag(r)}`),
    '',
    '## שונו',
    ...changed.map((r) => `~ ${escapeForList(r.path)}\t${fileRef(r)}\t(${prevByPath.get(r.path).kind} -> ${r.kind})${tag(r)}`),
    '',
    '## diff מאוחד לקובצי טקסט שהשתנו',
  ]
  let budget = DIFF_TOTAL_BYTES
  for (const r of changed) {
    const p = prevByPath.get(r.path)
    if (!(r.kind === 'text' && p.kind === 'text' && p.n && r.n)) continue
    const label = escapeForList(r.path)
    let body = null
    if (budget > 0) {
      const [oldText, newText] = await Promise.all([
        readFile(path.join(previous.dir, `${p.n}.txt`), 'utf8').catch(() => null),
        readFile(path.join(current.dir, `${r.n}.txt`), 'utf8'),
      ])
      if (oldText !== null) body = unifiedDiff(oldText, newText, { oldLabel: `prev/${label}`, newLabel: `files/${r.n}.txt` })
    }
    if (body && Buffer.byteLength(body) <= Math.min(DIFF_FILE_BYTES, budget)) {
      lines.push(body)
      budget -= Buffer.byteLength(body)
    } else {
      lines.push(`--- ${label}: השינוי גדול מדי להצגה כאן — יש לקרוא את הקובץ המלא files/${r.n}.txt`)
    }
  }
  return lines.join('\n') + '\n'
}

export function describeTarError(err) {
  if (err instanceof TarError && err.code === 'limit_exceeded') return 'ארכיון המקור חורג ממגבלות הגודל או מספר הקבצים'
  if (err instanceof TarError && err.code === 'path_traversal') return 'ארכיון המקור מכיל נתיב מוחלט או "..", ונדחה'
  return 'ארכיון המקור אינו תקין ולא ניתן לקרוא אותו'
}

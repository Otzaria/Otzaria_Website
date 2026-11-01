#!/usr/bin/env node
/**
 * copy-tesseract-assets.mjs — אירוח עצמי של tesseract.js (זיהוי מילים בדפדפן בעורך העמוד).
 *
 * מעתיק מ-node_modules ל-public/vendor/tesseract/v<גרסה>/ את worker.min.js ואת קובצי ה-core
 * (*.wasm.js — ה-wasm מוטמע בהם), ומוריד פעם אחת את מודל העברית (heb.traineddata.gz, ~570KB)
 * לתיקייה lang/<מודל>/ עם בדיקת sha256 נעולה. התיקייה ב-.gitignore — לא נשמרת ב-Git.
 *
 * רץ בתחילת npm run build (וכך גם בפריסה: npm install + npm run build). כשל בהורדת המודל אינו
 * מכשיל את ה-build (אזהרה בלבד — הזיהוי המקומי יציג שגיאה בעברית), אלא אם --strict.
 * העתקה ידנית: להוריד את הקובץ מה-URL שב-src/lib/editor/tesseractAssets.js לנתיב שמודפס כאן.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HEB_LANG, TESSERACT_PUBLIC_DIR } from '../src/lib/editor/tesseractAssets.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')
const OUT = path.join(ROOT, 'public', ...TESSERACT_PUBLIC_DIR.split('/'))
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function sameFile(a, b) {
  const [sa, sb] = await Promise.all([stat(a), stat(b).catch(() => null)])
  return sb && sa.size === sb.size && sa.mtimeMs <= sb.mtimeMs
}

async function copyRuntime() {
  const libDir = path.join(ROOT, 'node_modules', 'tesseract.js')
  const coreDir = path.join(ROOT, 'node_modules', 'tesseract.js-core')
  const { version } = JSON.parse(await readFile(path.join(libDir, 'package.json'), 'utf8'))
  const dest = path.join(OUT, `v${version}`)
  await mkdir(path.join(dest, 'core'), { recursive: true })
  const files = [[path.join(libDir, 'dist', 'worker.min.js'), path.join(dest, 'worker.min.js')]]
  for (const f of await readdir(coreDir)) {
    if (f.endsWith('.wasm.js')) files.push([path.join(coreDir, f), path.join(dest, 'core', f)])
  }
  let copied = 0
  for (const [from, to] of files) {
    if (await sameFile(from, to)) continue
    await copyFile(from, to)
    copied++
  }
  // גרסאות ישנות שנשארו מ-build קודם
  for (const entry of await readdir(OUT, { withFileTypes: true })) {
    if (entry.isDirectory() && /^v\d/.test(entry.name) && entry.name !== `v${version}`) {
      await rm(path.join(OUT, entry.name), { recursive: true, force: true })
    }
  }
  console.log(`tesseract.js v${version}: ${files.length} קבצים ב-${path.relative(ROOT, dest)} (${copied} הועתקו)`)
}

async function ensureLang() {
  const dir = path.join(OUT, 'lang', HEB_LANG.model)
  const file = path.join(dir, 'heb.traineddata.gz')
  const existing = await readFile(file).catch(() => null)
  if (existing && sha256(existing) === HEB_LANG.sha256) {
    console.log(`מודל העברית קיים: ${path.relative(ROOT, file)}`)
    return true
  }
  try {
    const res = await fetch(HEB_LANG.url, { signal: AbortSignal.timeout(60000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (sha256(buf) !== HEB_LANG.sha256) throw new Error('sha256 לא תואם')
    await mkdir(dir, { recursive: true })
    await writeFile(file, buf)
    console.log(`מודל העברית הורד: ${path.relative(ROOT, file)} (${Math.round(buf.length / 1024)}KB)`)
    return true
  } catch (err) {
    console.warn(`אזהרה: הורדת מודל העברית נכשלה (${err.message}). זיהוי המילים המקומי לא יעבוד עד שהקובץ יונח ידנית ב-${path.relative(ROOT, file)} (מקור: ${HEB_LANG.url}).`)
    return false
  }
}

await copyRuntime()
const langOk = await ensureLang()
if (strict && !langOk) process.exit(1)

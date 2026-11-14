#!/usr/bin/env node
/**
 * build-icon-font.mjs — בונה גופן אייקונים מקומי ומוקטן (subset) של Material Symbols.
 *
 * למה: הבקשה המקורית ל-Google Fonts ביקשה את הגופן המשתנה עם כל טווחי האיכסים
 * (opsz/wght/FILL/GRAD) — קובץ WOFF2 של ~3.96MB שנטען בכל ביקור קר, ממקור חיצוני
 * (DNS/TLS נוספים) ומחזיק stylesheet חוסם-רינדור. האתר משתמש בפועל רק ב-opsz 24,
 * FILL 0, GRAD 0, במשקל 300–400 ובכמה מאות אייקונים, ולכן subset מקומי שוקל עשרות KB.
 *
 * שימוש:
 *   node scripts/build-icon-font.mjs           # בונה מחדש (דורש רשת) ומעדכן את הפלטים
 *   node scripts/build-icon-font.mjs --check   # בדיקה offline: האם כל אייקון בקוד קיים בגופן
 *
 * הפלטים נשמרים ב-Git, כך שה-build הרגיל אינו תלוי ברשת:
 *   public/fonts/material-symbols-outlined.<hash>.woff2   הגופן עצמו (שם ממוספר ב-hash)
 *   src/app/styles/icon-font.css                          הצהרת @font-face
 *   src/lib/icon-font.js                                  ה-URL לשימוש ב-preload
 *   scripts/icon-font.manifest.json                       רשימת האייקונים שנכללו
 *   scripts/material-symbols-names.txt                    כל שמות האייקונים התקפים (ל---check offline)
 *
 * איזה שמות נכנסים: רק מחרוזות בהקשר של אייקון (src/lib/iconFontScan.mjs), אחרי סינון
 * מול רשימת השמות התקפים. אחרי ההורדה נקראות הליגטורות מהגופן עצמו
 * (src/lib/woff2Ligatures.mjs), כדי לוודא שכל אייקון שבשימוש באמת נמצא בו.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir, unlink, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectIconNames, filterKnown, ICON_NAMES_MAX_CHARS, iconNamesParamLength } from '../src/lib/iconFontScan.mjs'
import { woff2LigatureNames } from '../src/lib/woff2Ligatures.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_DIR = path.join(ROOT, 'src')
const FONTS_DIR = path.join(ROOT, 'public', 'fonts')
const CSS_OUT = path.join(ROOT, 'src', 'app', 'styles', 'icon-font.css')
const MODULE_OUT = path.join(ROOT, 'src', 'lib', 'icon-font.js')
const MANIFEST_OUT = path.join(ROOT, 'scripts', 'icon-font.manifest.json')
const UNIVERSE_OUT = path.join(ROOT, 'scripts', 'material-symbols-names.txt')

const FONT_BASENAME = 'material-symbols-outlined'
const FAMILY = 'Material Symbols Outlined'
// opsz=24, FILL=0, GRAD=0 קבועים; wght משתנה בטווח 300–400: האתר כולו במשקל 400 (font-weight:
// normal ב-base.css), וכלי העורך (Button size="tool", --tool-icon-weight) — 300, אייקון דק.
// ציר אחד בטווח צר מוסיף כ-40% לגודל ה-subset (עדיין עשרות KB).
const WGHT_MIN = 300
const WGHT_MAX = 400
const AXES = `opsz,wght,FILL,GRAD@24,${WGHT_MIN}..${WGHT_MAX},0,0`
const METADATA_URL = 'https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols'
const CSS_API = 'https://fonts.googleapis.com/css2'
// Google מחזיר WOFF2 רק ל-User-Agent מודרני; בלעדיו נקבל TTF ענק.
const MODERN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** subset תקין שוקל עשרות KB; מעל זה — Google החזיר את הגופן המלא (ראו build). */
const MAX_SUBSET_BYTES = 150 * 1024

// ה-API עשוי להחזיר את כל ציר 100–700 למרות הבקשה לטווח צר. מצמצמים מקומית
// באמצעות fonttools[woff] (נדרש רק ב-build:icons), ושומרים גם על משקל 300 של כלי העורך.
async function subsetWeights(woff2) {
  const dir = await mkdtemp(path.join(tmpdir(), 'otzaria-icon-font-'))
  try {
    const source = path.join(dir, 'source.woff2')
    const target = path.join(dir, 'subset.woff2')
    await writeFile(source, woff2)
    await promisify(execFile)('python3', [
      path.join(ROOT, 'scripts', 'subset-icon-weight.py'), source, target, String(WGHT_MIN), String(WGHT_MAX)
    ], { timeout: 30_000 })
    return await readFile(target)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// אייקונים מוצגים רק מקוד JS/TS (אין שימוש ב-CSS content/Markdown). קובצי טסט אינם מרונדרים.
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const isTestFile = (name) => /\.test\.[cm]?[jt]sx?$/.test(name)
// הסורק וקורא הגופן מכילים דוגמאות בהערות, ואינם מרנדרים אייקונים
const SKIP_FILES = new Set(['iconFontScan.mjs', 'woff2Ligatures.mjs'])

async function collectFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await collectFiles(full)))
    else if (CODE_EXTENSIONS.has(path.extname(entry.name)) && !isTestFile(entry.name) && !SKIP_FILES.has(entry.name)) out.push(full)
  }
  return out
}

const READ_CONCURRENCY = 16
const FETCH_TIMEOUT_MS = 30_000

/** קריאת קבצים עם הגבלת מקביליות (עץ גדול לא פותח אלפי קבצים בבת אחת); סדר התוצאות כסדר הקלט. */
async function readAll(files) {
  const results = new Array(files.length)
  let next = 0
  async function worker() {
    while (next < files.length) {
      const index = next++
      const f = files[index]
      results[index] = { file: path.relative(ROOT, f), text: await readFile(f, 'utf8') }
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, files.length) }, worker))
  return results
}

/** fetch עם timeout — בקשה תקועה לא תשאיר את הבנייה תלויה לנצח */
function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

/**
 * כל שמות האייקונים שה-API של Google מכיר. כולל גם שמות legacy של
 * Material Icons (people, email, restore...) שאינם glyph ב-Material Symbols אך
 * ה-API ממפה אותם — ולכן אין לסנן לפי unsupported_families.
 */
async function fetchIconUniverse() {
  const res = await fetchWithTimeout(METADATA_URL, { headers: { 'user-agent': MODERN_UA } })
  if (!res.ok) throw new Error(`metadata: HTTP ${res.status}`)
  // התגובה מוגנת בקידומת anti-JSON-hijacking
  const json = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''))
  const universe = new Set((json.icons ?? []).map((icon) => icon.name))
  if (universe.size === 0) throw new Error('metadata: לא נמצאו אייקונים')
  return universe
}

function subsetUrl(names) {
  const url = new URL(CSS_API)
  url.searchParams.set('family', `${FAMILY}:${AXES}`)
  url.searchParams.set('icon_names', names.join(','))
  // block ולא swap: לגופן אייקונים, swap מציג את שם האייקון כטקסט גלוי עד שהגופן עולה.
  url.searchParams.set('display', 'block')
  return url
}

/**
 * מסיר שמות שה-API דוחה (400) בחלוקה לחצאים: קבוצה שכולה תקינה נבדקת בבקשה אחת, וקבוצה פגומה
 * מתפצלת — כך מעט שמות פסולים עולים כ-O(k·log n) בקשות ולא בקשה לכל שם. רץ רק אם הבקשה
 * המרוכזת נכשלה (knownBad — הקבוצה כולה כבר ידועה כפגומה, אין צורך לבדוק אותה שוב).
 */
async function dropRejectedNames(names, knownBad = true) {
  if (names.length === 0) return []
  if (!knownBad) {
    const res = await fetchWithTimeout(subsetUrl(names), { headers: { 'user-agent': MODERN_UA } })
    if (res.ok) return names
  }
  if (names.length === 1) {
    console.warn(`⚠️  ${FAMILY} אינו מכיר את האייקון "${names[0]}" — הושמט`)
    return []
  }
  const mid = names.length >> 1
  const left = await dropRejectedNames(names.slice(0, mid), false)
  const right = await dropRejectedNames(names.slice(mid), false)
  return [...left, ...right]
}

async function fetchSubset(names) {
  let cssRes = await fetchWithTimeout(subsetUrl(names), { headers: { 'user-agent': MODERN_UA } })
  if (cssRes.status === 400) {
    // שם אחד או יותר אינו תקף — מאתרים ומשמיטים אותם ומנסים שוב.
    const valid = await dropRejectedNames(names)
    names.splice(0, names.length, ...valid)
    cssRes = await fetchWithTimeout(subsetUrl(names), { headers: { 'user-agent': MODERN_UA } })
  }
  if (!cssRes.ok) throw new Error(`css2: HTTP ${cssRes.status}`)
  const css = await cssRes.text()

  const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1]
  if (!fontUrl) throw new Error('css2: לא נמצא URL של WOFF2 בתשובה')

  const fontRes = await fetchWithTimeout(fontUrl)
  if (!fontRes.ok) throw new Error(`woff2: HTTP ${fontRes.status}`)
  return Buffer.from(await fontRes.arrayBuffer())
}

/** שמות שבשימוש שאינם בגופן (לפי הליגטורות שבו). */
function missingFromFont(names, woff2) {
  const ligatures = new Set(woff2LigatureNames(woff2))
  return names.filter((name) => !ligatures.has(name))
}

async function build() {
  const contents = await readAll(await collectFiles(SCAN_DIR))
  const universe = await fetchIconUniverse()

  const found = collectIconNames(contents)
  const { known: names, unknown } = filterKnown(found.keys(), universe)
  if (unknown.length) {
    // מחרוזות בהקשר של אייקון שאינן שם אייקון: ערכי case, 'none', מחלקות CSS וכו'.
    // מוצגות כדי שטעות כתיב בשם אייקון אמיתי לא תעבור בשקט.
    console.log(`ℹ️  ${unknown.length} מחרוזות בהקשר אייקון אינן שם של ${FAMILY} ולא נכללו:`)
    for (const name of unknown) console.log(`   ${name}  (${found.get(name)})`)
  }

  // מעל 4,096 תווים ב-icon_names, Google מחזיר בשקט את הגופן המלא. נכשלים לפני הבקשה.
  const paramLength = iconNamesParamLength(names)
  if (paramLength > ICON_NAMES_MAX_CHARS) {
    throw new Error(
      `רשימת האייקונים ארוכה מדי ל-Google Fonts: ${paramLength} תווים (${names.length} שמות), ` +
        `והמגבלה היא ${ICON_NAMES_MAX_CHARS}. יש לבדוק אם הסריקה (src/lib/iconFontScan.mjs) אוספת מחרוזות שאינן אייקונים.`
    )
  }

  const downloaded = await fetchSubset(names)
  // רשת ביטחון: subset תקין שוקל עשרות KB. גופן גדול מזה הוא כנראה הגופן המלא.
  if (downloaded.length > MAX_SUBSET_BYTES) {
    throw new Error(
      `הגופן שהתקבל שוקל ${(downloaded.length / 1024).toFixed(1)}KB (${names.length} שמות, ${paramLength} תווים) — ` +
        'כנראה Google התעלם מה-subset.'
    )
  }
  const woff2 = await subsetWeights(downloaded)
  const missing = missingFromFont(names, woff2)
  if (missing.length) {
    throw new Error(`אייקונים שבשימוש חסרים בגופן שהתקבל: ${missing.join(', ')}`)
  }

  const hash = createHash('sha256').update(woff2).digest('hex').slice(0, 8)
  const fileName = `${FONT_BASENAME}.${hash}.woff2`
  const publicUrl = `/fonts/${fileName}`

  for (const old of await readdir(FONTS_DIR)) {
    if (old.startsWith(`${FONT_BASENAME}.`) && old.endsWith('.woff2') && old !== fileName) {
      await unlink(path.join(FONTS_DIR, old))
    }
  }
  await writeFile(path.join(FONTS_DIR, fileName), woff2)

  await writeFile(
    CSS_OUT,
    `/* ============================================================
 * icon-font.css — נוצר אוטומטית על ידי scripts/build-icon-font.mjs. אין לערוך.
 * subset מקומי של ${FAMILY} (${names.length} אייקונים, ${AXES}).
 * ============================================================ */

@font-face {
  font-family: '${FAMILY}';
  font-style: normal;
  font-weight: ${WGHT_MIN} ${WGHT_MAX};
  /* block ולא swap — אחרת שם האייקון מוצג כטקסט עד שהגופן עולה */
  font-display: block;
  src: url('${publicUrl}') format('woff2');
}
`
  )

  await writeFile(
    MODULE_OUT,
    `// נוצר אוטומטית על ידי scripts/build-icon-font.mjs. אין לערוך.
// משמש ל-<link rel="preload"> ב-layout, כדי שהאייקונים לא ימתינו לפרסור ה-CSS.
export const ICON_FONT_URL = '${publicUrl}'
`
  )

  await writeFile(
    MANIFEST_OUT,
    `${JSON.stringify({ family: FAMILY, axes: AXES, file: publicUrl, bytes: woff2.length, icons: names }, null, 2)}\n`
  )

  // רשימת כל השמות התקפים — כדי ש---check (offline) ידע אילו מחרוזות הן שמות אייקון
  await writeFile(UNIVERSE_OUT, `${[...universe].sort().join('\n')}\n`)

  console.log(`✓ ${fileName} — ${names.length} אייקונים, ${(woff2.length / 1024).toFixed(1)}KB`)
}

/**
 * ב-CI הבדיקה מכשילה את ה-build, ולא רק מתריעה: אייקון חסר מוצג למשתמש כטקסט
 * ("drag_indicator" באמצע הממשק), וזה לא משהו שכדאי לדפלוי לעבור עליו בשקט.
 * מקומית זו אזהרה בלבד, כדי לא לחסום עבודה שוטפת — התיקון (build:icons) דורש
 * רשת. אכיפה מפורשת: --strict.
 */
function shouldEnforce() {
  return process.argv.includes('--strict') || process.env.CI === 'true' || process.env.CI === '1'
}

function reportFailure(message, details = []) {
  const enforce = shouldEnforce()
  const log = enforce ? console.error : console.warn
  log(`${enforce ? '✗' : '⚠️ '} ${message}`)
  for (const line of details) log(`   ${line}`)
  log('   הרץ: npm run build:icons')
  if (enforce) process.exitCode = 1
}

async function check() {
  let manifest
  let universe
  let woff2
  try {
    manifest = JSON.parse(await readFile(MANIFEST_OUT, 'utf8'))
    universe = new Set((await readFile(UNIVERSE_OUT, 'utf8')).split(/\r?\n/).filter(Boolean))
    woff2 = await readFile(path.join(ROOT, 'public', manifest.file))
  } catch (err) {
    reportFailure(`חסר קובץ של גופן האייקונים: ${err.message}`)
    return
  }

  // המקור הקובע הוא הגופן עצמו (הליגטורות שבו), לא רק רשימת השמות שבמניפסט.
  const found = collectIconNames(await readAll(await collectFiles(SCAN_DIR)))
  const { known } = filterKnown(found.keys(), universe)
  const missing = missingFromFont(known, woff2)

  if (missing.length === 0) {
    console.log(`✓ גופן האייקונים מכסה את כל ${known.length} האייקונים שבקוד`)
    return
  }

  // גבולות הבדיקה: היא מזהה שימושים שניתן לקרוא מהקוד סטטית (ראו iconFontScan.mjs).
  // אייקון שמגיע מנתונים — למשל אייקון של קטגוריית תוספים שהוזן בממשק הניהול — אינו נתפס.
  reportFailure(
    `${missing.length} אייקונים אינם ב-subset ולא יוצגו:`,
    missing.map((name) => `${name}  (${found.get(name)})`)
  )
}

const mode = process.argv.includes('--check') ? check : build
mode().catch((err) => {
  console.error(`✗ build-icon-font: ${err.message}`)
  process.exit(1)
})

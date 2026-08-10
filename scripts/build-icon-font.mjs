#!/usr/bin/env node
/**
 * build-icon-font.mjs — בונה גופן אייקונים מקומי ומוקטן (subset) של Material Symbols.
 *
 * למה: הבקשה המקורית ל-Google Fonts ביקשה את הגופן המשתנה עם כל טווחי האיכסים
 * (opsz/wght/FILL/GRAD) — קובץ WOFF2 של ~3.96MB שנטען בכל ביקור קר, ממקור חיצוני
 * (DNS/TLS נוספים) ומחזיק stylesheet חוסם-רינדור. האתר משתמש בפועל רק במופע
 * הסטטי (24/400/0/0) ובכמה מאות אייקונים, ולכן subset מקומי שוקל עשרות KB.
 *
 * שימוש:
 *   node scripts/build-icon-font.mjs           # בונה מחדש (דורש רשת) ומעדכן את הפלטים
 *   node scripts/build-icon-font.mjs --check   # בדיקה offline: האם כל אייקון בקוד קיים בגופן
 *
 * הפלטים נשמרים ב-Git, כך שה-build הרגיל אינו תלוי ברשת:
 *   public/fonts/material-symbols-outlined.<hash>.woff2   הגופן עצמו (שם ממוספר ב-hash)
 *   src/app/styles/icon-font.css                          הצהרת @font-face
 *   src/lib/icon-font.js                                  ה-URL לשימוש ב-preload
 *   scripts/icon-font.manifest.json                       רשימת האייקונים שנכללו (ל---check)
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_DIR = path.join(ROOT, 'src')
const FONTS_DIR = path.join(ROOT, 'public', 'fonts')
const CSS_OUT = path.join(ROOT, 'src', 'app', 'styles', 'icon-font.css')
const MODULE_OUT = path.join(ROOT, 'src', 'lib', 'icon-font.js')
const MANIFEST_OUT = path.join(ROOT, 'scripts', 'icon-font.manifest.json')

const FONT_BASENAME = 'material-symbols-outlined'
const FAMILY = 'Material Symbols Outlined'
// מופע סטטי: opsz=24, wght=400, FILL=0, GRAD=0 — האתר אינו משתמש באיכסים משתנים.
const AXES = 'opsz,wght,FILL,GRAD@24,400,0,0'
const METADATA_URL = 'https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols'
const CSS_API = 'https://fonts.googleapis.com/css2'
// Google מחזיר WOFF2 רק ל-User-Agent מודרני; בלעדיו נקבל TTF ענק.
const MODERN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.md', '.json'])

/** כל שם אפשרי של אייקון שמופיע בקוד — סריקה רחבה בכוונה (ראה collectCandidates). */
const TOKEN_RE = /[a-z][a-z0-9_]{2,}/g

/**
 * מקומות שבהם שם אייקון מופיע *בוודאות*, לצורך בדיקת --check:
 *  1. טקסט בתוך אלמנט עם המחלקה material-symbols-outlined
 *  2. שדה icon: 'name' באובייקטי תצורה
 *  3. prop בצורת icon="name"
 */
const PRECISE_PATTERNS = [
  /material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]*)\s*</g,
  /\bicon:\s*['"]([a-z][a-z0-9_]*)['"]/g,
  /\bicon=["']([a-z][a-z0-9_]*)["']/g,
]

async function collectFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await collectFiles(full)))
    else if (CODE_EXTENSIONS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

async function readAll(files) {
  return Promise.all(files.map((f) => readFile(f, 'utf8').then((text) => ({ file: f, text }))))
}

/**
 * סריקה רחבה: כל token בקוד ששמו תואם שם אייקון קיים נכנס ל-subset.
 * זו הכללה מכוונת — היא תופסת גם אייקונים שנקבעים דינמית (משתנה, תנאי, טבלת
 * תצורה) ולכן אינם מזוהים בסריקה מדויקת. המחיר הוא כמה KB של אייקונים מיותרים,
 * והתמורה היא שאייקון לא "נעלם" בפרודקשן.
 */
function collectCandidates(contents, universe) {
  const found = new Set()
  for (const { text } of contents) {
    for (const token of text.matchAll(TOKEN_RE)) {
      if (universe.has(token[0])) found.add(token[0])
    }
  }
  return found
}

/** סריקה מדויקת: רק מקומות שהם בוודאות שם אייקון. */
function collectPrecise(contents) {
  const found = new Map() // name -> file
  for (const { file, text } of contents) {
    for (const pattern of PRECISE_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        if (!found.has(match[1])) found.set(match[1], path.relative(ROOT, file))
      }
    }
  }
  return found
}

/**
 * כל שמות האייקונים שה-API של Google מכיר. כולל גם שמות legacy של
 * Material Icons (people, email, restore...) שאינם glyph ב-Material Symbols אך
 * ה-API ממפה אותם — ולכן אין לסנן לפי unsupported_families.
 */
async function fetchIconUniverse() {
  const res = await fetch(METADATA_URL, { headers: { 'user-agent': MODERN_UA } })
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

/** מסיר שמות שה-API דוחה (400), אחד-אחד. רץ רק אם הבקשה המרוכזת נכשלה. */
async function dropRejectedNames(names) {
  const kept = []
  for (const name of names) {
    const res = await fetch(subsetUrl([name]), { headers: { 'user-agent': MODERN_UA } })
    if (res.ok) kept.push(name)
    else console.warn(`⚠️  ${FAMILY} אינו מכיר את האייקון "${name}" — הושמט`)
  }
  return kept
}

async function fetchSubset(names) {
  let cssRes = await fetch(subsetUrl(names), { headers: { 'user-agent': MODERN_UA } })
  if (cssRes.status === 400) {
    // שם אחד או יותר אינו תקף — מאתרים ומשמיטים אותם ומנסים שוב.
    const valid = await dropRejectedNames(names)
    names.splice(0, names.length, ...valid)
    cssRes = await fetch(subsetUrl(names), { headers: { 'user-agent': MODERN_UA } })
  }
  if (!cssRes.ok) throw new Error(`css2: HTTP ${cssRes.status}`)
  const css = await cssRes.text()

  const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1]
  if (!fontUrl) throw new Error('css2: לא נמצא URL של WOFF2 בתשובה')

  const fontRes = await fetch(fontUrl)
  if (!fontRes.ok) throw new Error(`woff2: HTTP ${fontRes.status}`)
  return Buffer.from(await fontRes.arrayBuffer())
}

async function build() {
  const contents = await readAll(await collectFiles(SCAN_DIR))
  const universe = await fetchIconUniverse()

  const precise = collectPrecise(contents)
  const unknown = [...precise.keys()].filter((n) => !universe.has(n))
  if (unknown.length) {
    console.warn(`⚠️  שמות אייקונים שאינם מוכרים ל-${FAMILY}: ${unknown.join(', ')}`)
  }

  // האייקונים הוודאיים תמיד נכללים, גם אם אינם ברשימת המטא-דאטה.
  const names = [...new Set([...collectCandidates(contents, universe), ...precise.keys()])].sort()

  const woff2 = await fetchSubset(names)
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
 * subset מקומי של ${FAMILY} (${names.length} אייקונים, מופע סטטי ${AXES}).
 * ============================================================ */

@font-face {
  font-family: '${FAMILY}';
  font-style: normal;
  font-weight: 400;
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
  try {
    manifest = JSON.parse(await readFile(MANIFEST_OUT, 'utf8'))
  } catch {
    reportFailure('אין icon-font.manifest.json')
    return
  }

  const included = new Set(manifest.icons)
  const precise = collectPrecise(await readAll(await collectFiles(SCAN_DIR)))
  const missing = [...precise].filter(([name]) => !included.has(name))

  if (missing.length === 0) {
    console.log(`✓ גופן האייקונים מכסה את כל ${precise.size} האייקונים שבקוד`)
    return
  }

  // הערה על גבולות הבדיקה: היא מזהה רק שימושים שניתן לקרוא מהקוד סטטית
  // (טקסט בתוך span עם המחלקה, שדה icon:, prop בצורת icon="..."). אייקון
  // שנקבע דינמית לגמרי — למשל מתוך תשובת API — אינו נתפס כאן. ה-subset עצמו
  // נבנה מסריקה רחבה בהרבה, ולכן בפועל הוא מכיל יותר ממה שהבדיקה מוודאת.
  reportFailure(
    `${missing.length} אייקונים אינם ב-subset ולא יוצגו:`,
    missing.map(([name, file]) => `${name}  (${file})`)
  )
}

const mode = process.argv.includes('--check') ? check : build
mode().catch((err) => {
  console.error(`✗ build-icon-font: ${err.message}`)
  process.exit(1)
})

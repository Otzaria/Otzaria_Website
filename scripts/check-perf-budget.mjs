#!/usr/bin/env node
/**
 * check-perf-budget.mjs — תקציב ביצועים על פלט ה-build.
 *
 * למה: כל השיפורים שנעשו (גופן אייקונים מוקטן, נכסי תמונה מותאמים, הוצאת
 * framer-motion מהמעטפת, אנימציות ב-CSS) יכולים להיסחף בחזרה בשקט — ייבוא אחד
 * במקום הלא נכון מחזיר 114KB לכל דף, ושימוש אחד ב-motion מחזיר opacity:0 ל-HTML.
 * הבדיקה כאן היא הגנה אוטומטית על מה שתוקן.
 *
 * הבדיקה offline לגמרי ורצה על .next שאחרי next build — בלי דפדפן ובלי שרת.
 * היא *אינה* מודדת Core Web Vitals (LCP/INP/TTFB); לשם כך צריך Lighthouse מול
 * שרת אמיתי, וזו הרחבה נפרדת. מה שהיא מודדת הוא מה שנקבע בזמן build.
 *
 * שימוש:
 *   node scripts/check-perf-budget.mjs          # אזהרה בלבד
 *   node scripts/check-perf-budget.mjs --strict # מכשיל (וכך גם ב-CI)
 */

import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NEXT_DIR = path.join(ROOT, '.next')

// התקציבים נקבעו כ-15% מעל המצב הנמדד בזמן הכתיבה, כדי לתפוס רגרסיה אמיתית
// ולא גדילה טבעית. כשעוברים אותם — או שמייעלים, או שמעדכנים במודע עם הסבר.
const PAGE_BUDGETS = [
  { page: 'index', label: '/', gzipKB: 285, allowFramerMotion: true },
  { page: 'library', label: '/library', gzipKB: 240, allowFramerMotion: false },
  { page: 'about', label: '/about', gzipKB: 235, allowFramerMotion: false },
  { page: 'privacy', label: '/privacy', gzipKB: 235, allowFramerMotion: false },
  { page: 'docs/dicta', label: '/docs/dicta', gzipKB: 235, allowFramerMotion: false },
]

const ASSET_BUDGETS = [
  { file: 'public/bg.avif', maxKB: 70 },
  { file: 'public/bg.webp', maxKB: 145 },
  { file: 'public/logo.webp', maxKB: 15 },
  { file: 'public/logo.png', maxKB: 35 },
  { file: 'src/app/icon.png', maxKB: 8 },
  { file: 'src/app/apple-icon.png', maxKB: 8 },
]

// גופן האייקונים: שמו כולל hash, ולכן מאותר לפי התחילית.
const ICON_FONT_MAX_KB = 45

const failures = []
const notes = []

async function pageScripts(page) {
  const html = await readFile(path.join(NEXT_DIR, 'server', 'app', `${page}.html`), 'utf8')
  const urls = [...html.matchAll(/src="([^"]*\/_next\/static\/[^"]*)"/g)].map((m) => m[1])

  let gzip = 0
  let hasFramerMotion = false
  for (const url of urls) {
    const file = path.join(NEXT_DIR, url.replace('/_next/', ''))
    try {
      const bytes = await readFile(file)
      gzip += gzipSync(bytes).length
      if (bytes.includes('framerAppearId')) hasFramerMotion = true
    } catch {
      // צ'אנק שאינו על הדיסק (למשל URL חוצה-מקורות) — מדלגים
    }
  }

  // אלמנטים שמגיעים מהשרת מוסתרים ונראים רק אחרי hydration
  const hidden =
    (html.match(/opacity:0/g) ?? []).length + (html.match(/scale\(0\)/g) ?? []).length

  return { scripts: urls.length, gzipKB: gzip / 1024, hasFramerMotion, hidden }
}

async function checkPages() {
  for (const budget of PAGE_BUDGETS) {
    let measured
    try {
      measured = await pageScripts(budget.page)
    } catch {
      notes.push(`${budget.label} — אין HTML שנוצר מראש, לא נבדק`)
      continue
    }

    if (measured.gzipKB > budget.gzipKB) {
      failures.push(
        `${budget.label} — JavaScript התחלתי ${measured.gzipKB.toFixed(0)}KB gzip, ` +
        `מעל התקציב של ${budget.gzipKB}KB`
      )
    }

    if (measured.hidden > 0) {
      failures.push(
        `${budget.label} — ${measured.hidden} אלמנטים מגיעים מהשרת עם opacity:0/scale(0), ` +
        'כלומר התוכן אינו נראה עד hydration. יש להשתמש במחלקות animate-enter-* של CSS'
      )
    }

    if (measured.hasFramerMotion && !budget.allowFramerMotion) {
      failures.push(
        `${budget.label} — framer-motion חזר לחבילה של הדף (כ-114KB raw). ` +
        'בדוק אם קומפוננטה במעטפת או בדף מייבאת motion שלא לצורך'
      )
    }

    notes.push(
      `${budget.label} — ${measured.scripts} סקריפטים, ${measured.gzipKB.toFixed(0)}KB gzip ` +
      `(תקציב ${budget.gzipKB}KB), מוסתרים: ${measured.hidden}, framer: ${measured.hasFramerMotion ? 'כן' : 'לא'}`
    )
  }
}

async function checkAssets() {
  for (const { file, maxKB } of ASSET_BUDGETS) {
    try {
      const { size } = await stat(path.join(ROOT, file))
      const kb = size / 1024
      if (kb > maxKB) {
        failures.push(`${file} — ${kb.toFixed(0)}KB, מעל התקציב של ${maxKB}KB`)
      }
    } catch {
      failures.push(`${file} — הקובץ חסר. הרץ: npm run build:assets`)
    }
  }

  const manifestPath = path.join(ROOT, 'scripts', 'icon-font.manifest.json')
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const kb = manifest.bytes / 1024
    if (kb > ICON_FONT_MAX_KB) {
      failures.push(
        `גופן האייקונים — ${kb.toFixed(0)}KB, מעל התקציב של ${ICON_FONT_MAX_KB}KB. ` +
        'ייתכן שנכנסה בקשה לגופן המשתנה המלא במקום subset'
      )
    }
    notes.push(`גופן אייקונים — ${kb.toFixed(1)}KB, ${manifest.icons.length} אייקונים`)
  } catch {
    failures.push('אין scripts/icon-font.manifest.json — הרץ: npm run build:icons')
  }
}

async function main() {
  try {
    await stat(NEXT_DIR)
  } catch {
    console.log('⚠️  אין תיקיית .next — הרץ next build קודם. הבדיקה מדולגת.')
    return
  }

  await checkPages()
  await checkAssets()

  for (const note of notes) console.log(`   ${note}`)

  if (failures.length === 0) {
    console.log('✓ תקציב הביצועים נשמר')
    return
  }

  const enforce = process.argv.includes('--strict') || process.env.CI === 'true' || process.env.CI === '1'
  const log = enforce ? console.error : console.warn
  log(`${enforce ? '✗' : '⚠️ '} ${failures.length} חריגות מתקציב הביצועים:`)
  for (const failure of failures) log(`   • ${failure}`)
  if (enforce) process.exitCode = 1
}

main().catch((err) => {
  console.error(`✗ check-perf-budget: ${err.message}`)
  process.exitCode = 1
})

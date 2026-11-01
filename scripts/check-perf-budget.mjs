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

import { readdir, readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPrefetch } from './check-prefetch.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NEXT_DIR = path.join(ROOT, '.next')

// התקציבים נקבעו כ-15% מעל המצב הנמדד בזמן הכתיבה, כדי לתפוס רגרסיה אמיתית
// ולא גדילה טבעית. כשעוברים אותם — או שמייעלים, או שמעדכנים במודע עם הסבר.
const PAGE_BUDGETS = [
  // framer-motion הוסר גם מדף הבית ומ-/faq (אפקטי CSS במקומו) — אסור בכל דף.
  // המספרים כאן כוללים גם את ה-polyfills של nomodule (כ-30KB) שדפדפן מודרני
  // אינו מוריד, ולכן גבוהים מה"JS gzip" שנמדד בדפדפן.
  { page: 'index', label: '/', gzipKB: 240, allowFramerMotion: false },
  { page: 'faq', label: '/faq', gzipKB: 240, allowFramerMotion: false },
  { page: 'library', label: '/library', gzipKB: 238, allowFramerMotion: false },
  { page: 'about', label: '/about', gzipKB: 236, allowFramerMotion: false },
  { page: 'privacy', label: '/privacy', gzipKB: 236, allowFramerMotion: false },
  { page: 'offline', label: '/offline', gzipKB: 237, allowFramerMotion: false },
  { page: 'docs/dicta', label: '/docs/dicta', gzipKB: 236, allowFramerMotion: false },
  // חנות התוספים: ייבוא אחד של pluginSubmission/pluginManifest מקוד לקוח מחזיר
  // polyfills של node (zlib/stream/buffer, כ-60KB gzip) לכל דפי החנות.
  { page: 'plugins', label: '/plugins', gzipKB: 248, allowFramerMotion: false },
  { page: 'plugins/all', label: '/plugins/all', gzipKB: 247, allowFramerMotion: false },
  { page: 'plugins/upload', label: '/plugins/upload', gzipKB: 245, allowFramerMotion: false },
  // מעטפת הספרייה (Header, מונה הודעות) — נציגים של הדפים המוגנים הסטטיים.
  { page: 'library/books', label: '/library/books', gzipKB: 246, allowFramerMotion: false },
  { page: 'library/dashboard', label: '/library/dashboard', gzipKB: 250, allowFramerMotion: false },
]

// מה להריץ כשקובץ חסר — לפי מקור הקובץ (לא כולם נוצרים ב-npm run build:assets)
const HINT_ASSETS = 'הרץ: npm run build:assets (או node scripts/optimize-assets.mjs --home לנכסי דף הבית בלבד)'
const HINT_FONT = 'קובץ גופן שנשמר ב-Git (src/app/fonts) — שחזר אותו מ-Git; אין סקריפט שמייצר אותו'

const ASSET_BUDGETS = [
  { file: 'public/logo.webp', maxKB: 15 },
  { file: 'public/logo.png', maxKB: 35 },
  { file: 'src/app/icon.png', maxKB: 8 },
  { file: 'src/app/apple-icon.png', maxKB: 8 },
  // דף הבית: הספר הסגור הוא תמונת ה-LCP (320w ל-DPR1, 560w ל-DPR2); הרצועה (12 פריימים) היא
  // הנכס הכבד בדף — AVIF ל-95% מהדפדפנים, WebP לשאר. שמות עם גרסה: הם מוגשים כ-immutable.
  { file: 'public/home/golden-book-closed.v2-320.webp', maxKB: 11 },
  { file: 'public/home/golden-book-closed.v2-560.webp', maxKB: 23 },
  { file: 'public/home/golden-book.v2-320.webp', maxKB: 20 },
  { file: 'public/home/golden-book.v2-560.webp', maxKB: 41 },
  { file: 'public/home/golden-book-sprite.v2.avif', maxKB: 95 },
  { file: 'public/home/golden-book-sprite.v2.webp', maxKB: 168 },
  // גופן שם האתר והכותרות (next/font/local, עם preload) — נטען בכל עמוד. OTVilna-Bold.woff2
  // נשאר בתיקייה אבל אינו נטען (layout.tsx), ולכן אין לו תקציב; אם יחובר — להוסיף כאן.
  { file: 'src/app/fonts/OTVilna-Regular.woff2', maxKB: 18, hint: HINT_FONT },
  // גופן הגוף והממשק (Assistant, משתנה, עברית+לטינית) — preload בכל עמוד. ראו fonts/Assistant-README.md.
  { file: 'src/app/fonts/Assistant-Variable.woff2', maxKB: 30, hint: HINT_FONT },
  // כותרות הדפים הישנים (font-frank, בלי preload) — נטען רק בעמוד שמבקש אותו, ורק המשקל שבשימוש.
  { file: 'src/app/fonts/FrankRuehlCLM-Medium.woff2', maxKB: 20, hint: HINT_FONT },
  { file: 'src/app/fonts/FrankRuehlCLM-Bold.woff2', maxKB: 20, hint: HINT_FONT },
  // גופן הקלדה בלי תגים בעורך העמוד (Noto Sans Hebrew, משתנה 400–700, בלי preload) — נטען רק למי שבחר בו.
  { file: 'src/app/fonts/NotoSansHebrew-Variable.woff2', maxKB: 32, hint: HINT_FONT },
  // עוד גופני הקלדה בלי תגים בעורך (בלי preload, רק למי שבחר): IBM Plex — הקבצים הרשמיים בלי חיתוך;
  // Google Sans ו-Open Sans — משתנים 400–700, חיתוך לעברית+לטינית.
  { file: 'src/app/fonts/IBMPlexSansHebrew-Regular.woff2', maxKB: 34, hint: HINT_FONT },
  { file: 'src/app/fonts/IBMPlexSansHebrew-Bold.woff2', maxKB: 34, hint: HINT_FONT },
  { file: 'src/app/fonts/GoogleSans-Variable.woff2', maxKB: 54, hint: HINT_FONT },
  { file: 'src/app/fonts/OpenSans-Variable.woff2', maxKB: 42, hint: HINT_FONT },
]

// הנכסים שדף הבית מוריד בביקור קר רגיל (AVIF, DPR1): ספר סגור + פתוח ב-320w + הרצועה. מעבר לסכום
// הזה — נכס חדש או רגרסיה בקידוד. (סכום בנפרד מתקציבי הקבצים: כל קובץ יכול לעבור ב-15% והסכום יתנפח.)
const HERO_IMAGES_TOTAL_KB = 130
const HERO_IMAGES = [
  'public/home/golden-book-closed.v2-320.webp',
  'public/home/golden-book.v2-320.webp',
  'public/home/golden-book-sprite.v2.avif',
]

// תיקיות ב-public שמוגשות כ-immutable לשנה (next.config.ts) — כל קובץ בהן חייב לשאת גרסה בשמו
// (.v2 / -v2), אחרת שינוי תוכן לא יגיע למי ששמר את הישן. ראו scripts/optimize-assets.mjs.
const IMMUTABLE_PUBLIC_DIRS = ['public/home', 'public/icons']
const VERSIONED_NAME = /[.-]v\d+(?:[.-]|$)/

// CSS גלובלי (gzip, סך כל ה-stylesheets שה-HTML של הדף טוען). נמדד 34.4KB (Tailwind: כל המחלקות שבשימוש
// באתר); התקציב ~15% מעל. אותו CSS גלובלי לכל הדפים, לכן שני נציגים מספיקים.
const CSS_BUDGETS = [
  { page: 'index', label: '/', gzipKB: 40 },
  { page: 'library/books', label: '/library/books', gzipKB: 40 },
]

// גופן האייקונים: שמו כולל hash, ולכן מאותר לפי התחילית.
// (מידה בפועל ~32KB — ציר wght בטווח 300–400 לאייקונים הדקים של כלי העורך; התקציב ~15% מעל)
const ICON_FONT_MAX_KB = 37

const failures = []
const notes = []

// gzip לפי קובץ (URL) — אותו צ'אנק משותף לרוב הדפים, ואין סיבה לקרוא ולדחוס אותו מחדש לכל דף
const gzipCache = new Map()
async function gzipOf(url) {
  let entry = gzipCache.get(url)
  if (!entry) {
    const bytes = await readFile(path.join(NEXT_DIR, url.replace('/_next/', '')))
    entry = { gzip: gzipSync(bytes).length, hasFramerMotion: bytes.includes('framerAppearId') }
    gzipCache.set(url, entry)
  }
  return entry
}

async function pageScripts(page) {
  const html = await readFile(path.join(NEXT_DIR, 'server', 'app', `${page}.html`), 'utf8')
  const urls = [...html.matchAll(/src="([^"]*\/_next\/static\/[^"]*)"/g)].map((m) => m[1])

  let gzip = 0
  let hasFramerMotion = false
  const unreadable = []
  for (const url of urls) {
    try {
      const entry = await gzipOf(url)
      gzip += entry.gzip
      if (entry.hasFramerMotion) hasFramerMotion = true
    } catch {
      // צ'אנק שאינו קריא לא נבלע: התעלמות ממנו מורידה מלאכותית את המשקל הנמדד
      // ויכולה להסתיר רגרסיה.
      unreadable.push(url)
    }
  }
  if (unreadable.length > 0) {
    throw new Error(`${unreadable.length} צ'אנקים אינם קריאים: ${unreadable.join(', ')}`)
  }

  // אלמנטים שמגיעים מהשרת מוסתרים ונראים רק אחרי hydration
  const hidden =
    (html.match(/opacity:\s*0(?![.\d])/g) ?? []).length + (html.match(/scale\(0\)/g) ?? []).length

  return { scripts: urls.length, gzipKB: gzip / 1024, hasFramerMotion, hidden }
}

async function checkPages() {
  for (const budget of PAGE_BUDGETS) {
    let measured
    try {
      measured = await pageScripts(budget.page)
    } catch (err) {
      // דף שנמצא בתקציב ואינו נמדד הוא כשל, לא הערה: אם הוא הפסיק להיווצר
      // סטטית, שינה מיקום או נעלם — הבדיקה חייבת לצעוק ולא לעבור בשקט.
      failures.push(
        `${budget.label} — לא ניתן למדוד את ${budget.page}.html (${err.message}). ` +
        'אם המסלול זז או הפסיק להיות סטטי, עדכן את PAGE_BUDGETS'
      )
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

async function checkCss() {
  for (const budget of CSS_BUDGETS) {
    try {
      const html = await readFile(path.join(NEXT_DIR, 'server', 'app', `${budget.page}.html`), 'utf8')
      const urls = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]*\/_next\/static\/[^"]*\.css)"/g)].map((m) => m[1])
      let gzip = 0
      for (const url of urls) gzip += (await gzipOf(url)).gzip
      const kb = gzip / 1024
      if (kb > budget.gzipKB) {
        failures.push(`${budget.label} — CSS גלובלי ${kb.toFixed(1)}KB gzip, מעל התקציב של ${budget.gzipKB}KB`)
      }
      notes.push(`${budget.label} — ${urls.length} קובצי CSS, ${kb.toFixed(1)}KB gzip (תקציב ${budget.gzipKB}KB)`)
    } catch (err) {
      failures.push(`${budget.label} — לא ניתן למדוד CSS (${err.message}). אם המסלול זז, עדכן את CSS_BUDGETS`)
    }
  }
}

async function checkProtectedPrefetch() {
  // הבדיקה עצמה ב-scripts/check-prefetch.mjs — ניתוח AST של JSX, כולל
  // הקומפוננטות שדפים ציבוריים מייבאים.
  const { violations, scanned, publicPages } = await checkPrefetch()

  if (violations.length > 0) {
    failures.push(
      `${violations.length} קישורים בדפים ציבוריים מבצעים prefetch לנתיב מוגן ` +
      `(הוסף prefetch={false}):\n     ` +
      violations.map((v) => `${v.file}:${v.line} → ${v.href}`).join('\n     ')
    )
  } else {
    notes.push(`prefetch — ${scanned} קבצים מ-${publicPages} דפים ציבוריים, אין קישור לנתיב מוגן`)
  }
}

async function checkAssets() {
  for (const { file, maxKB, hint = HINT_ASSETS } of ASSET_BUDGETS) {
    try {
      const { size } = await stat(path.join(ROOT, file))
      const kb = size / 1024
      if (kb > maxKB) {
        failures.push(`${file} — ${kb.toFixed(0)}KB, מעל התקציב של ${maxKB}KB`)
      }
    } catch {
      failures.push(`${file} — הקובץ חסר. ${hint}`)
    }
  }

  let heroKB = 0
  for (const file of HERO_IMAGES) {
    try {
      heroKB += (await stat(path.join(ROOT, file))).size / 1024
    } catch {
      // כבר דווח כקובץ חסר למעלה
    }
  }
  if (heroKB > HERO_IMAGES_TOTAL_KB) {
    failures.push(`תמונות הגיבור (ספר סגור + פתוח 320w + רצועת AVIF) — ${heroKB.toFixed(0)}KB, מעל התקציב של ${HERO_IMAGES_TOTAL_KB}KB`)
  }
  notes.push(`תמונות הגיבור (DPR1, AVIF) — ${heroKB.toFixed(0)}KB (תקציב ${HERO_IMAGES_TOTAL_KB}KB)`)

  for (const dir of IMMUTABLE_PUBLIC_DIRS) {
    for (const name of await readdir(path.join(ROOT, dir))) {
      if (!VERSIONED_NAME.test(name)) {
        failures.push(`${dir}/${name} — מוגש כ-immutable (שנה) אבל אין גרסה בשם (למשל name.v2.ext). שנה את השם בכל שינוי תוכן`)
      }
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
  await checkCss()
  await checkProtectedPrefetch()
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

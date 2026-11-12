#!/usr/bin/env node
/**
 * check-admin-tokens.mjs — ערכי עיצוב קשיחים בממשק הניהול וב-ui/.
 *
 * למה: ממשק הניהול עבר לטוקנים (src/app/styles/*.css) — תפקידי טקסט/רדיוס/צל וצבעים סמנטיים
 * שמתחלפים בערכה כהה. צבע Tailwind גולמי, שם מיושן או text-sm שנכנסים בחזרה — נסחפים בשקט.
 * הסריקה עצמה (מה נחשב קשיח) — src/lib/tokenAudit.js, עם טסטים; כאן רק קבצים, חריגות ודוח.
 *
 * שימוש:
 *   npm run check:admin-tokens                       # מכשיל (יציאה 1) כשיש ממצא מחוץ לחריגות — חלק מה-build
 *   node scripts/check-admin-tokens.mjs --report     # דוח בלבד (תמיד יוצא 0)
 *   node scripts/check-admin-tokens.mjs --files      # גם רשימת הקבצים, מהגדול לקטן
 *   node scripts/check-admin-tokens.mjs --verbose    # כל ממצא עם שורה
 *
 * ממצא חדש — מתקנים לטוקן (ראו src/app/styles/README.md). רק כשאין טוקן ואין סיבה ליצור אחד — חריגה
 * ב-EXCEPTIONS למטה, נקודתית ככל האפשר (tokens: המחלקה המדויקת), עם נימוק.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES, CATEGORY_LABELS, auditSource, findException, summarize } from '../src/lib/tokenAudit.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** מה נסרק — נתיבי הניהול ורכיבי ui/ */
const SCOPE = [
  'src/components/admin/',
  'src/app/library/admin/',
  'src/components/ui/',
  'src/components/trainingProof/admin/',
  'src/components/pageProof/admin/',
]

/** מה לא נסרק בכלל: טסטים (מחרוזות לדוגמה), ורכיבי ui ישנים שבשימוש מחוץ לניהול */
const SKIP = [/\.test\.[cm]?[jt]sx?$/, /^src\/components\/ui\/legacy\//]

/**
 * חריגות — ממצאים שנספרים בנפרד ולא יכשילו כשהסקריפט יהפוך למכשיל. כל שורה עם נימוק.
 * path שמסתיים ב-/ — תיקייה. בלי categories — כל הקטגוריות.
 */
export const EXCEPTIONS = [
  {
    path: 'src/components/pageProof/admin/',
    reason: 'קוד מת (0 מייבאים) שממתין להחלטת המשתמש על הסרתו — לא מתקנים קוד שאולי יימחק',
  },
  ...['Modal.jsx', 'FormInput.jsx', 'ImagePreviewModal.jsx'].map((name) => ({
    path: `src/components/ui/${name}`,
    reason: 'רכיב ui ישן — 0 שימושים בניהול, בשימוש רק באתר (ספרייה, עורך). שינוי משפיע על כל האתר; מחוץ להיקף הניקוי',
  })),
  {
    path: 'src/components/admin/tzurat/RegionImage.jsx',
    categories: ['old-scale', 'arbitrary'],
    reason: 'רכיב אינטראקטיבי (תמונה עם אזורים, מיקום בפיקסלים) — מותר לגעת רק בצבעים, לא בגאומטריה/DOM',
  },
  {
    path: 'src/components/ui/Dialog.tsx',
    tokens: ['sm:text-2xl'],
    reason: 'כותרת החלון מ-sm: ‏Assistant 700 ב-1.44rem (text-title-lg בנייד). אין תפקיד title בגודל הזה, וכותרת קטנה יותר תשנה את כל חלונות האתר',
  },
  {
    path: 'src/components/admin/dashboard/QueueCard.jsx',
    tokens: ['font-bold'],
    reason: 'מספר הספירה בכרטיס תור (Assistant, לא Vilna) — headline-sm במשקל 700; אין תפקיד מודגש בגודל הזה',
  },
  {
    path: 'src/app/library/admin/uploads/edit/[id]/page.jsx',
    tokens: ['text-white'],
    reason: 'האות באווטאר — על צבע רקע מחושב (lib/avatar-colors) שאינו מתחלף בערכה, ולכן לבן בשתי הערכות; טוקן on-* היה מתהפך בכהה',
  },
  {
    path: 'src/components/admin/appReports/ReportFiles.jsx',
    tokens: ['max-h-[600px]'],
    reason: 'גובה מרבי לתצוגת קובץ הדיווח (גלילה פנימית) — ערך של רכיב יחיד; אין מידה בסולם (container חל רק על רוחב)',
  },
  {
    path: 'src/components/admin/searchFeedback/KeysTable.jsx',
    tokens: ['min-w-[44rem]'],
    reason: 'רוחב מינימלי לטבלה שממנו נגללת אופקית — נגזר מעמודות הטבלה הזו בלבד',
  },
]

async function listFiles(dir) {
  const abs = path.join(ROOT, dir)
  let entries
  try {
    entries = await readdir(abs, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && /\.[cm]?[jt]sx?$/.test(e.name))
    .map((e) => path.relative(ROOT, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/'))
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const files = [...new Set((await Promise.all(SCOPE.map(listFiles))).flat())]
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .sort()

  const results = await Promise.all(files.map(async (file) => ({
    file,
    findings: auditSource(await readFile(path.join(ROOT, file), 'utf8')),
  })))
  const summary = summarize(results, EXCEPTIONS)

  console.log(`סריקת טוקנים בניהול — ${files.length} קבצים`)
  for (const c of CATEGORIES) {
    const excused = summary.excusedByCategory[c] ? ` (+${summary.excusedByCategory[c]} בחריגות)` : ''
    console.log(`  ${CATEGORY_LABELS[c]}: ${summary.byCategory[c]}${excused}`)
  }
  console.log(`סה"כ: ${summary.total} ב-${summary.files.length} קבצים · בחריגות: ${summary.excused}`)

  if (args.has('--files') || args.has('--verbose')) {
    console.log('\nלפי קובץ:')
    for (const { file, count } of summary.files) console.log(`  ${String(count).padStart(4)}  ${file}`)
  }
  if (args.has('--verbose')) {
    console.log('\nממצאים:')
    for (const { file, findings } of results) {
      for (const f of findings) {
        if (findException(file, f, EXCEPTIONS)) continue
        console.log(`  ${file}:${f.line}  ${f.category}  ${f.token}`)
      }
    }
  }

  if (!args.has('--report') && summary.total > 0) {
    console.error(`\n✗ ${summary.total} ערכים קשיחים מחוץ לחריגות (--verbose לפירוט). תקנו לטוקן, או הוסיפו חריגה מנומקת ב-EXCEPTIONS.`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

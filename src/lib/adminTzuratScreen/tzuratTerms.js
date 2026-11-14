// "צורת הדף" — ניסוח המצבים (תג + גוון לפי המילון), חישובי לשונית "מצב" וכתובת ההורדה. לוגיקה טהורה, בלי React
// (נבדק ב-tzuratTerms.test.mjs). ערכי השרת לא משתנים — רק איך הם מוצגים.

import { formatNumber } from '../adminTerms.js'
import { fileSizeText } from '../adminList/fileSize.js'

/**
 * המצבים לפי סוג הפריט: [שם, גוון Badge]. המונחים הכלליים לפי המילון (ממתין לאישור, מאושר, נדחה, בעבודה, נכשל,
 * מושהה, דורש בדיקה); מונחי התחום של צורת הדף (הוסכם, במחלוקת, הוכרע) נשארו — אין להם מקבילה כללית.
 */
export const STATUS = {
  item: {
    open: ['פתוח', 'neutral'],
    agreed: ['הוסכם', 'success'],
    disputed: ['במחלוקת', 'warning'],
    resolved: ['הוכרע', 'success'],
    flagged: ['דורש בדיקה', 'error'],
    obsolete: ['לא רלוונטי', 'neutral'],
  },
  submission: {
    processing: ['השמירה לא הושלמה', 'error'],
    submitted: ['ממתין לאישור', 'warning'],
    approved: ['מאושר', 'success'],
    rejected: ['נדחה', 'neutral'],
  },
  report: {
    new: ['חדש', 'info'],
    in_progress: ['בעבודה', 'primary'], // כמו "בעבודה" בהגהת עמודים (pageTerms)
    fixed: ['תוקן', 'success'],
    wontfix: ['לא יתוקן', 'neutral'],
    duplicate: ['כפול', 'neutral'],
  },
  upload: {
    uploading: ['בהעלאה', 'info'],
    queued: ['בתור', 'info'],
    processing: ['בעיבוד', 'info'],
    done: ['הושלם', 'success'],
    failed: ['נכשל', 'error'],
  },
  batch: {
    active: ['פעיל', 'success'],
    paused: ['מושהה', 'warning'],
  },
  token: {
    active: ['פעיל', 'success'],
    revoked: ['בוטל', 'neutral'],
    expired: ['פג תוקף', 'neutral'],
  },
}

/** שם המצב; ערך לא מוכר — הערך עצמו (כדי שלא ייעלם) */
export function statusLabel(kind, status) {
  return STATUS[kind]?.[status]?.[0] || String(status || '—')
}
/** גוון ה-Badge; לא מוכר — neutral */
export function statusTone(kind, status) {
  return STATUS[kind]?.[status]?.[1] || 'neutral'
}
/** האפשרויות לבורר (SelectMenu): [{value, label}] בסדר שנקבע */
export function statusOptions(kind, order) {
  const keys = order || Object.keys(STATUS[kind] || {})
  return keys.map((value) => ({ value, label: statusLabel(kind, value) }))
}

/** סדר המצבים של החלטת נוסח בבורר ובפילוח */
export const ITEM_STATUS_ORDER = ['disputed', 'flagged', 'open', 'agreed', 'resolved', 'obsolete']

/** אחוז שלם 0–100; מכנה 0 — 0 */
export function percentOf(part, total) {
  const t = Number(total) || 0
  if (t <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((Number(part) || 0) / t) * 100)))
}

/** המסכתות לפי הסדר שנקבע בחבילה (order); כשה-order שווה — בסדר שהגיעו מהשרת */
export function sortBooks(books) {
  return [...(books || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** אפשרויות בורר המסכת (מתשובת batches): [{value: slug, label: שם}] */
export function bookOptions(batches) {
  return sortBooks(batches?.batches).map((b) => ({ value: b.slug, label: b.masechet || b.slug }))
}

/**
 * שורות פילוח: [{key, label, value, percent}] — קודם לפי order (מה שקיים), אחר כך השאר. labelOf — שם לכל מפתח.
 * @param {Record<string, number> | undefined} counts @param {(k: string) => string} [labelOf] @param {string[]} [order]
 */
export function countRows(counts, labelOf = (k) => k, order = []) {
  const c = counts || {}
  const keys = [...order.filter((k) => k in c), ...Object.keys(c).filter((k) => !order.includes(k))]
  const total = keys.reduce((s, k) => s + (Number(c[k]) || 0), 0)
  return keys.map((key) => ({ key, label: labelOf(key), value: Number(c[key]) || 0, percent: percentOf(c[key], total) }))
}

/** סוגי גושים שחולקים שם (גיליון ושוליים: mg, mg1…) — מונה אחד לכל שם */
export function mergeByLabel(counts, labelOf) {
  const out = {}
  for (const [k, v] of Object.entries(counts || {})) {
    const label = labelOf(k)
    out[label] = (out[label] || 0) + (Number(v) || 0)
  }
  return out
}

/** "42 מתנדבים · 11 פעילים בשבוע האחרון" */
export function volunteersText(volunteers) {
  const total = Number(volunteers?.total) || 0
  const active = Number(volunteers?.active7d) || 0
  const t = total === 1 ? 'מתנדב אחד' : `${formatNumber(total)} מתנדבים`
  const a = active === 1 ? 'פעיל אחד' : `${formatNumber(active)} פעילים`
  return `${t} · ${a} בשבוע האחרון`
}

/**
 * הסה"כ ברשימה מסוננת אחרי שפריט שינה מצב מקומית (בלי טעינה מחדש): יצא מהמצב שבסינון — פחות 1, נכנס אליו — ועוד 1.
 * filter 'all' (או ריק) — בלי שינוי; בלי סה"כ מהשרת (null/undefined) — נשאר כך.
 * @param {number | null | undefined} total @param {string} filter @param {string} from @param {string} to
 */
export function totalAfterChange(total, filter, from, to) {
  if (total === null || total === undefined) return total
  const t = Number(total) || 0
  if (!filter || filter === 'all' || from === to) return t
  return Math.max(0, t - (from === filter ? 1 : 0) + (to === filter ? 1 : 0))
}

/** "אחת מתוך 5" — ספירה של רשימה עם סה"כ מהשרת */
export function totalText(total, one, many) {
  const t = Number(total) || 0
  return t === 1 ? one : `${formatNumber(t)} ${many}`
}

/** "בדיקה ראשונה" / "בדיקה שנייה" — הסבב (round) של העמוד, בלי המילה "סבב" */
export function roundText(round) {
  const n = Math.max(1, Math.floor(Number(round) || 1))
  return ['', 'בדיקה ראשונה', 'בדיקה שנייה', 'בדיקה שלישית'][n] || `בדיקה מס׳ ${formatNumber(n)}`
}

/**
 * מה יש בהגשה, בשורה אחת: "6 סימוני שורות · 3 החלטות · תיקון ידני אחד · 2 דיווחים". אפסים לא מוצגים.
 * "עוגן" (anchors) — סימון של שורה בעמוד: איפה היא מתחילה, או שהיא נבדקה ונכונה.
 * @param {{ anchors?: number, items?: number, manual?: number, reports?: number } | null | undefined} counts
 */
export function submissionCountsText(counts) {
  const c = counts || {}
  const parts = [
    [c.anchors, 'סימון שורה אחד', 'סימוני שורות'],
    [c.items, 'החלטה אחת', 'החלטות'],
    [c.manual, 'תיקון ידני אחד', 'תיקונים ידניים'],
    [c.reports, 'דיווח אחד', 'דיווחים'],
  ].filter(([n]) => Number(n) > 0).map(([n, one, many]) => totalText(n, one, many))
  return parts.length ? parts.join(' · ') : 'בלי סימונים'
}

/** מה אפשר להוריד (הקובץ לכלי של צורת הדף) — הסדר כמו קודם; השלישי — מה זה, בשורה קטנה */
export const EXPORT_TYPES = [
  ['decisions', 'הכרעות נוסח (כולל תיקונים ידניים)', 'מה נקבע בכל החלטה שהוסכמה או הוכרעה'],
  ['anchors', 'סימוני שורות', 'איפה מתחילה כל שורה, מהגשות שאושרו'],
  ['checks', 'מבט כללי', 'מה המתנדבים ענו על העמוד כולו: גושים, שורות, נוסח'],
  ['reports', 'דיווחים', 'תקלות שמתנדבים דיווחו, עם המצב שלהן'],
  ['contributors', 'תורמים', 'המתנדבים שהשתתפו בבדיקה'],
]

/**
 * כתובת ההורדה — בדיוק כמו קודם: since — תאריך (YYYY-MM-DD) או ריק; types — רשימה (כולם = בלי סינון).
 * @param {string} api @param {string} since @param {string[]} types
 */
export function exportUrl(api, since, types) {
  const p = new URLSearchParams()
  if (since) {
    const d = new Date(`${since}T00:00:00`)
    if (!Number.isNaN(d.getTime())) p.set('since', d.toISOString())
  }
  if (types && types.length && types.length < EXPORT_TYPES.length) {
    // החוזה כותב פעם types ופעם parts — נשלחים שניהם (אותו ערך)
    p.set('types', types.join(','))
    p.set('parts', types.join(','))
  }
  const s = p.toString()
  return `${api}/export${s ? `?${s}` : ''}`
}

/** שם הקובץ שיורד — כמו קודם */
export function exportFileName(today, since) {
  return `tzurat-hadaf-export-${today}${since ? `-since-${since}` : ''}.ndjson`
}

/** גודל הקובץ שירד ("12 KB", "3.4 MB") — הנוסח האחיד של הניהול (adminList/fileSize.js) */
export function sizeText(bytes) {
  return fileSizeText(Number(bytes) || 0)
}

const n0 = (v) => Math.max(0, Number(v) || 0)
const counted = (pairs) => pairs.filter(([v]) => n0(v) > 0).map(([v, one, many]) => (n0(v) === 1 ? one : `${formatNumber(n0(v))} ${many}`))

/**
 * סיכום ייבוא חבילה (summary של העלאה שהסתיימה, importPackage) בעברית פשוטה, בלי מזהים פנימיים (slug, buildId),
 * בלי אפסים ובלי שמות שדות באנגלית: "עמודים: 12 חדשים, 3 עודכנו · החלטות: 412 חדשות, 5 שכבר נענו לא נדרסו · 30 תמונות".
 * סיכום שהוא טקסט — כמו שהוא; שדה לא מוכר — לא מוצג.
 * @param {any} summary @returns {string[]}
 */
export function importSummaryParts(summary) {
  if (!summary) return []
  if (typeof summary !== 'object') return [String(summary)]
  // שם המסכת — רק בעברית (slug הוא מזהה פנימי)
  const out = typeof summary.masechet === 'string' && /[֐-׿]/.test(summary.masechet) ? [summary.masechet] : []
  const pages = summary.pages && typeof summary.pages === 'object' ? summary.pages : null
  const pageParts = pages
    ? counted([
      [pages.created, 'אחד חדש', 'חדשים'],
      [pages.updated, 'אחד עודכן', 'עודכנו'],
      [pages.reopened, 'אחד נפתח לבדיקה נוספת', 'נפתחו לבדיקה נוספת'],
    ])
    : counted([[summary.pages, 'אחד', '']]).map((t) => t.trim())
  if (pageParts.length) out.push(`עמודים: ${pageParts.join(', ')}`)
  const items = summary.items && typeof summary.items === 'object' ? summary.items : null
  const itemParts = items
    ? counted([
      [items.created, 'אחת חדשה', 'חדשות'],
      [items.updated, 'אחת עודכנה', 'עודכנו'],
      [items.revived, 'אחת חזרה לפעילות', 'חזרו לפעילות'],
      [items.skippedAnswered, 'אחת שכבר נענתה לא נדרסה', 'שכבר נענו לא נדרסו'],
      [items.keptAnswered, 'אחת נשמרה כי כבר נענתה', 'נשמרו כי כבר נענו'],
      [items.obsoleted ?? items.obsolete, 'אחת סומנה "לא רלוונטי"', 'סומנו "לא רלוונטי"'],
    ])
    : counted([[summary.items, 'אחת', '']]).map((t) => t.trim())
  if (itemParts.length) out.push(`החלטות: ${itemParts.join(', ')}`)
  out.push(...counted([
    [summary.images, 'תמונה אחת', 'תמונות'],
    [summary.practice, 'החלטת תרגול אחת', 'החלטות תרגול'],
    [summary.ignored, 'קובץ אחד שלא זוהה (דולג)', 'קבצים שלא זוהו (דולגו)'],
  ]))
  return out
}

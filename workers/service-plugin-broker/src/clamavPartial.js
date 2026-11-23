// סריקת ClamAV חלקית (חריגה ממגבלות הסורק): ניסוח ההודעה, אימות חריגת המנהל והערת הדוח הסופי. טהור לחלוטין.
import { LIMITS } from './policy.js'
import { escapeForList } from './util.js'

const MAX_NAME_CHARS = 80
const MAX_NOTE_ITEMS = 10

/** חתימה של ClamAV שמשמעותה "לא נסרק במלואו" (בגלל --alert-exceeds-max), לא ממצא. */
export const isLimitsSignature = (signature) => /^Heuristics\.Limits\.Exceeded(\.|$)/.test(String(signature))

/** תווית קובץ בהודעות ClamAV: 'קובץ התוסף' / 'המתקין <שם>' / 'קובץ בהגשה' (קובץ לא מזוהה). */
export function clamavAssetLabel(asset) {
  if (!asset) return 'קובץ בהגשה'
  if (asset.isPlugin || asset.key === 'plugin') return 'קובץ התוסף'
  return `המתקין ${escapeForList(String(asset.name ?? asset.key)).slice(0, MAX_NAME_CHARS)}`
}

/** רשימת שורות "- תווית: חתימה" שנחתכת עם "- ועוד N" כך שהטקסט כולו לא יעבור את maxChars. */
function fitList(head, items, tail, maxChars) {
  const lines = items.map((i) => `- ${i.label}: ${escapeForList(i.signature).slice(0, 120)}`)
  const build = (n) => {
    const shown = lines.slice(0, n)
    if (n < lines.length) shown.push(`- ועוד ${lines.length - n}`)
    return [head, ...shown, tail].filter(Boolean).join('\n')
  }
  for (let n = lines.length; n > 0; n--) {
    const text = build(n)
    if (text.length <= maxChars) return text
  }
  return build(0).slice(0, maxChars)
}

/**
 * הודעת הכשל התפעולי `clamav_incomplete` (נחתכת בשרת ל-LIMITS.reasonChars — לכן נבנית בתוך המגבלה).
 * @param {{key:string|null, label:string, signature:string}[]} items הקבצים שלא נסרקו במלואם
 * @param {number} totalFiles מספר הקבצים שנסרקו בהפעלה
 */
export function clamavIncompleteMessage(items, totalFiles, maxChars = LIMITS.reasonChars) {
  const others = totalFiles - new Set(items.map((i) => i.key ?? `?${i.label}`)).size
  const tail = [
    others > 0
      ? `שאר הקבצים (${others}) נסרקו ולא נמצאה בהם חתימה מוכרת.`
      : 'אף קובץ בהגשה לא נסרק במלואו.',
    'סריקה חלקית אינה "נקי": מנהל יכול לאשר המשך בדיקה למרות הסריקה החלקית.',
  ].join(' ')
  return fitList('סריקת ClamAV לא הושלמה עבור חלק מהקבצים (חריגה ממגבלות הסורק):', items, tail, maxChars)
}

/**
 * חריגת המנהל מהמשימה (`job.overrides.clamavPartial`). כל ערך פגום → null (אין חריגה), כמו שרת ישן בלי השדה.
 * @returns {{reason:string, grantedAt:string} | null}
 */
export function clamavPartialOverride(job) {
  const o = job?.overrides?.clamavPartial
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const { reason, grantedAt } = o
  if (typeof reason !== 'string' || !reason.trim() || reason.length > LIMITS.reasonChars) return null
  if (typeof grantedAt !== 'string' || grantedAt.length > 64) return null
  const t = Date.parse(grantedAt)
  if (!Number.isFinite(t)) return null
  return { reason, grantedAt: new Date(t).toISOString() }
}

const oneLine = (s, max) => escapeForList(String(s ?? '').replace(/\s+/g, ' ').trim()).slice(0, max)

/** תווית לפי מפתח הקובץ בקבלה (plugin / native<n>) מול פרטי המשימה. */
function labelForKey(job, key) {
  if (key === 'plugin') return 'קובץ התוסף'
  const asset = (job?.assets ?? []).find((a) => a?.key === key)
  return asset ? clamavAssetLabel({ ...asset, isPlugin: false }) : 'קובץ בהגשה'
}

/** הערת "סריקה חלקית" לראש הדוח הסופי, או null כשקבלת clamav אינה `partial`. */
export function partialScanNote(job, clamavData) {
  if (clamavData?.status !== 'partial') return null
  const incomplete = Array.isArray(clamavData.incomplete) ? clamavData.incomplete : []
  const items = incomplete.slice(0, MAX_NOTE_ITEMS).map((i) => `${labelForKey(job, i?.key)} (${oneLine(i?.signature, 120)})`)
  if (incomplete.length > MAX_NOTE_ITEMS) items.push(`ועוד ${incomplete.length - MAX_NOTE_ITEMS}`)
  const reason = oneLine(clamavData.override?.reason, LIMITS.reasonChars)
  return `שימו לב: סריקת ClamAV הייתה חלקית — הקבצים הבאים לא נסרקו במלואם (חריגה ממגבלות הסורק): ${items.join('; ') || 'לא ידוע'}. `
    + `המשך הבדיקה אושר ידנית ע״י מנהל${reason ? `: ${reason}` : ''}.`
}

/**
 * מוסיף את הערת הסריקה החלקית לראש הדוח שנשלח ב-result בלבד (לא לקבלת claude ולא לתוצאה המקומית החתומה).
 * הדוח כולו נשאר בתוך LIMITS.reportBytes — גוף הדוח נחתך בסופו אם צריך.
 */
export function withPartialScanNote(job, clamavData, report, maxBytes = LIMITS.reportBytes) {
  const note = partialScanNote(job, clamavData)
  if (!note) return report
  const head = `${note}\n\n`
  const text = head + report
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  const room = Math.max(0, maxBytes - Buffer.byteLength(head, 'utf8') - 16)
  const body = Buffer.from(String(report), 'utf8').subarray(0, room).toString('utf8').replace(/�+$/, '')
  return `${head}${body}…`
}

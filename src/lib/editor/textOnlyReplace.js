import { tokenize } from '../../components/editor/v2/richMap.js'

/**
 * חיפוש והחלפה בטקסט העמוד בלבד — לא בתוך תגי HTML (<h2>, <img src="data:...">) ולא בתוך ישויות
 * (&#160;). בלי זה "ניקוי ספרות" הפך <h2> ל-<h> ומחק ספרות מ-base64 של תמונות, ו"החלף הכול" של i
 * הפך <i> ל-<X>.
 *
 * הטקסט מחולק לקטעים: כל רצף שבין תג/ישות לתג/ישות הבאים (כולל מעברי שורה — חיפוש של ^13 עדיין
 * חוצה שורות). התאמה נחשבת רק אם היא כולה בתוך קטע אחד.
 */

/**
 * @param {string} raw
 * @returns {{ start: number, end: number }[]} קטעי הטקסט (בלי תגים וישויות), לפי הסדר
 */
export function textSegments(raw) {
  const s = String(raw ?? '')
  /** @type {{ start: number, end: number }[]} */
  const out = []
  let start = 0
  for (const t of tokenize(s)) {
    if (t.kind !== 'tag' && t.kind !== 'entity') continue
    if (t.start > start) out.push({ start, end: t.start })
    start = t.end
  }
  if (s.length > start) out.push({ start, end: s.length })
  return out
}

/** '^13' (מעבר שורה בתחביר החיפוש של העורך) → '\n' */
export const processSearchPattern = (str) => String(str ?? '').replaceAll('^13', '\n')

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * ביטוי החיפוש של העורך (גלובלי). טקסט רגיל — מילולי; ביטוי רגולרי לא תקין — null.
 * @param {string} findText @param {boolean} isRegex
 * @returns {RegExp|null}
 */
export function buildSearchRegex(findText, isRegex) {
  const p = processSearchPattern(findText)
  if (!p) return null
  try {
    return new RegExp(isRegex ? p : escapeRegex(p), 'g')
  } catch {
    return null
  }
}

const globalOf = (re) => (re.global ? new RegExp(re.source, re.flags) : new RegExp(re.source, re.flags + 'g'))

/**
 * החלפה בכל קטעי הטקסט (כמו String.replace עם g — כולל $1 וכו'), תגים וישויות נשארים כמו שהם.
 * @param {string} raw @param {RegExp} regex @param {string} replacement
 * @returns {{ value: string, count: number }}
 */
export function replaceOutsideTags(raw, regex, replacement) {
  const s = String(raw ?? '')
  const re = globalOf(regex)
  let count = 0
  let out = ''
  let last = 0
  for (const seg of textSegments(s)) {
    const piece = s.slice(seg.start, seg.end)
    const n = (piece.match(re) || []).length
    out += s.slice(last, seg.start)
    if (n) {
      count += n
      out += piece.replace(re, replacement)
    } else {
      out += piece
    }
    last = seg.end
  }
  out += s.slice(last)
  return { value: count ? out : s, count }
}

/**
 * ההתאמה הראשונה שמתחילה ב-from או אחריו ושכולה בתוך קטע טקסט.
 * @param {string} raw @param {RegExp} regex @param {number} from
 * @returns {{ index: number, length: number, match: RegExpExecArray } | null}
 */
export function findOutsideTags(raw, regex, from = 0) {
  const s = String(raw ?? '')
  const re = globalOf(regex)
  for (const seg of textSegments(s)) {
    if (seg.end < from) continue
    const piece = s.slice(seg.start, seg.end)
    re.lastIndex = Math.max(0, from - seg.start)
    const m = re.exec(piece)
    if (m) return { index: seg.start + m.index, length: m[0].length, match: m }
  }
  return null
}

/**
 * "חפש הבא": מ-from, ואם אין — מההתחלה (wrapped).
 * @param {string} raw @param {RegExp} regex @param {number} from
 * @returns {{ index: number, length: number, wrapped: boolean } | null}
 */
export function findNextOutsideTags(raw, regex, from) {
  const hit = findOutsideTags(raw, regex, from)
  if (hit) return { index: hit.index, length: hit.length, wrapped: false }
  const again = from > 0 ? findOutsideTags(raw, regex, 0) : null
  return again ? { index: again.index, length: again.length, wrapped: true } : null
}

/**
 * האם הטווח [start, end) כולו בתוך קטע טקסט אחד (ולא נוגע בתג) — לבדיקת "החלף" על הבחירה.
 * @param {string} raw @param {number} start @param {number} end
 */
export function rangeInText(raw, start, end) {
  return textSegments(raw).some((seg) => start >= seg.start && end <= seg.end)
}

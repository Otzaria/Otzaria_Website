// צורת הדף — תרגול: הרכבת התשובות לשליחה, תרגום התוצאות לכרטיסים, והפרקים בהנחיות למי שטעה הרבה. טהור.
import { answerBody, optionText } from './fastLogic'
import { GUIDE_SECTIONS, QUESTION_GUIDE } from './labels'

export const WRONG_LIMIT = 3

const SPECIAL = { unclear: 'לא ברור מהסריקה', other: 'משהו אחר' }

/** הטקסט של האפשרות הנכונה (expected — מזהה אפשרות) */
export function expectedText(item, expected) {
  const opt = (item?.options || []).find((o) => o.id === expected)
  if (opt) return optionText(opt)
  return SPECIAL[expected] || String(expected || '')
}

/** {answers:[{id, choice, text?}]} מתוך מפה id → value (רק המוכנות) */
export function practiceAnswers(items, values) {
  const out = []
  for (const it of items || []) {
    const b = answerBody(values?.[it.id])
    if (b) out.push({ id: it.id, ...b })
  }
  return out
}

/** מפה id → {correct, expectedText, explain} מתוך תשובת השרת */
export function resultsById(items, results) {
  const byId = new Map((items || []).map((it) => [it.id, it]))
  const out = {}
  for (const r of results || []) {
    const it = byId.get(r.id)
    out[r.id] = { correct: !!r.correct, expectedText: expectedText(it, r.expected), explain: r.explain || it?.explain || '' }
  }
  return out
}

/** הפרקים בהנחיות שכדאי לקרוא — לפי סוגי השאלות שבהן טעו; [] כשהטעויות לא יותר מ-WRONG_LIMIT */
export function guideSuggestions(items, results) {
  const wrong = (results || []).filter((r) => !r.correct)
  if (wrong.length <= WRONG_LIMIT) return []
  const byId = new Map((items || []).map((it) => [it.id, it]))
  const secs = new Set([GUIDE_SECTIONS.fast, GUIDE_SECTIONS.abbreviations])
  for (const r of wrong) {
    const it = byId.get(r.id)
    const s = QUESTION_GUIDE[it?.question]
    if (s) secs.add(s)
    if (it && (it.kind === 'r' || it.kind === 't')) secs.add(GUIDE_SECTIONS.rashi)
  }
  return [...secs]
}

export const SECTION_LABEL = {
  fast: 'המסלול המהיר — סוגי השאלות',
  'print-decides': 'מה שנדפס — הוא שקובע',
  abbreviations: 'ראשי תיבות וקיצורים',
  'rashi-script': 'אותיות שמתחלפות בכתב רש"י',
}

// הנחיות עריכה — לוגיקה טהורה לשני הטפסים במסך הספרים:
//   "הנחיות עריכה" של ספר (book.editingInfo: { title, sections: [{ title, items: string[] }] }) + עמוד דוגמה
//   "הנחיות כלליות" לכל הספרים (global-instructions: { sections: [{ title, items: string[] }] })
// בטופס כל סעיף הוא כותרת ותיבת טקסט, ושורה בתיבה = הנחיה אחת. הטקסט נשמר בטופס כמו שהוא (כולל
// שורות ריקות באמצע הקלדה) ומתפרק להנחיות רק בשמירה — כך Enter בסוף השורה לא "נבלע".

/** כותרת ברירת המחדל של הנחיות העריכה של ספר (כמו קודם) */
export const DEFAULT_EDITING_TITLE = 'הנחיות עריכה'

let keySeq = 0
const nextKey = () => `s${++keySeq}`

/** הנחיות → טקסט בתיבה (שורה לכל הנחיה) */
export function itemsToText(items) {
  return (Array.isArray(items) ? items : []).map((i) => String(i ?? '')).join('\n')
}

/** טקסט בתיבה → הנחיות: כל שורה שאינה ריקה, בלי רווחים בקצוות */
export function textToItems(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

/**
 * הסעיפים מהשרת → סעיפי טופס ({ key, title, text }).
 * @param {unknown} sections
 */
export function toSectionForms(sections) {
  return (Array.isArray(sections) ? sections : []).map((s) => ({
    key: nextKey(),
    title: String(s?.title ?? ''),
    text: itemsToText(s?.items),
  }))
}

/** סעיף טופס חדש וריק */
export function newSectionForm(title = '') {
  return { key: nextKey(), title, text: '' }
}

/**
 * סעיפי טופס → סעיפים לשמירה: סעיף בלי אף הנחיה נזרק; סעיף בלי כותרת — נשמר עם כותרת ריקה רק אם
 * requireTitle כבוי. (בהנחיות של ספר — כמו קודם — סעיף נשמר רק עם כותרת והנחיה אחת לפחות.)
 * @param {{ title: string, text: string }[]} forms
 */
export function cleanSections(forms, { requireTitle = true } = {}) {
  return forms
    .map((f) => ({ title: f.title.trim(), items: textToItems(f.text) }))
    .filter((s) => s.items.length > 0 && (!requireTitle || s.title))
}

/**
 * סעיפים שיאבדו בשמירה (יש בהם הנחיות אבל אין כותרת) — כדי להזהיר לפני שהם נעלמים בשקט.
 * @returns {string[]} מפתחות הסעיפים
 */
export function untitledSectionKeys(forms) {
  return forms.filter((f) => !f.title.trim() && textToItems(f.text).length > 0).map((f) => f.key)
}

/**
 * הטופס של הנחיות העריכה של ספר.
 * @param {{ title?: string, sections?: any[] } | null} editingInfo
 * @param {number | null | undefined} examplePage
 */
export function toBookInstructionsForm(editingInfo, examplePage) {
  const sections = toSectionForms(editingInfo?.sections)
  return {
    title: String(editingInfo?.title || DEFAULT_EDITING_TITLE),
    sections: sections.length > 0 ? sections : [newSectionForm('כללי')],
    examplePage: Number.isInteger(examplePage) && examplePage > 0 ? examplePage : null,
  }
}

/**
 * מה נשלח לשרת (/api/book/update-info): { editingInfo, examplePage }.
 * @param {{ title: string, sections: { title: string, text: string }[], examplePage: number | null }} form
 */
export function bookInstructionsPayload(form) {
  return {
    editingInfo: { title: form.title.trim() || DEFAULT_EDITING_TITLE, sections: cleanSections(form.sections) },
    examplePage: form.examplePage ?? null,
  }
}

/** האם הטופס שונה ממה שנשמר (להשוואה בלי מפתחות הסעיפים ובלי רווחים בקצוות) */
export function sameSections(a, b) {
  const shape = (forms) => JSON.stringify(cleanSections(forms, { requireTitle: false }))
  return shape(a) === shape(b)
}

/**
 * מספר עמוד דוגמה מהשדה: ריק → null; מספר שלם בטווח → המספר; אחרת — הודעת שגיאה.
 * @returns {{ value: number | null, error: string | null }}
 */
export function parseExamplePage(text, totalPages) {
  const raw = String(text ?? '').trim()
  if (!raw) return { value: null, error: null }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return { value: null, error: 'כתוב מספר עמוד (מ-1 ומעלה), או השאר ריק.' }
  if (totalPages > 0 && n > totalPages) return { value: null, error: `בספר יש ${totalPages.toLocaleString('he-IL')} עמודים.` }
  return { value: n, error: null }
}

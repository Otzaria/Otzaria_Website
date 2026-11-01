import { changedRange } from './formatToggle.js'
import { richFieldApi } from './editorField.js'

/**
 * מחיל עריכה מחושבת על שדה העורך (textarea או התצוגה המעוצבת — שניהם חושפים value +
 * selectionStart/End + setSelectionRange): compute(value, start, end) → { value, start, end }.
 * ההחלה — החלפה אחת של הטווח שהשתנה דרך execCommand('insertText'), כך שביטול (Ctrl+Z) מחזיר את
 * כל הפעולה בצעד אחד בשתי התצוגות. בתצוגה המעוצבת — replaceRange של השדה (החלפה מדויקת של הגולמי;
 * execCommand לא שולח beforeinput כשהטקסט הנראה לא משתנה, למשל בהסרת <b>). אם הדפדפן לא תומך —
 * onFallback(newValue) (עדכון ה-state ישירות).
 *
 * @param {HTMLElement & { value: string, selectionStart: number, selectionEnd: number,
 *   setSelectionRange: (a: number, b: number) => void }} el
 * @param {(value: string, start: number, end: number) => { value: string, start: number, end: number }} compute
 * @param {(value: string) => void} [onFallback]
 * @returns {boolean} האם הטקסט השתנה
 */
export function applyFieldEdit(el, compute, onFallback) {
  const before = el.value
  const next = compute(before, el.selectionStart, el.selectionEnd)
  const range = changedRange(before, next.value)
  el.focus()
  if (!range) {
    el.setSelectionRange(next.start, next.end)
    return false
  }
  const rich = richFieldApi(el)
  if (rich?.replaceRange) {
    rich.replaceRange(range.from, range.to, range.text)
    el.setSelectionRange(next.start, next.end)
    return true
  }
  el.setSelectionRange(range.from, range.to)
  const ok = typeof document !== 'undefined' && document.execCommand('insertText', false, range.text)
  if (!ok) {
    onFallback?.(next.value)
    setTimeout(() => el.setSelectionRange(next.start, next.end), 0)
    return true
  }
  el.setSelectionRange(next.start, next.end)
  return true
}

/**
 * החלפת כל ערך השדה בערך מחושב (החלף הכול, בדיקת איות, חיפושים קבועים, ניקוי ספרות, הטמעת
 * תמונה) — דרך applyFieldEdit: רק הטווח שהשתנה מוחלף, בצעד ביטול אחד, ובתצוגה המעוצבת דרך
 * replaceRange (לא execCommand על contenteditable — שם הדפדפן משנה את ה-DOM בעצמו והתגים
 * היו נקראים מחדש כטקסט). הסמן — בסוף הטווח שהשתנה; מיקום הגלילה נשמר.
 *
 * @param {HTMLElement & { value: string, selectionStart: number, selectionEnd: number,
 *   setSelectionRange: (a: number, b: number) => void, scrollTop: number }} el
 * @param {string} newValue
 * @param {(value: string) => void} [onFallback]
 * @returns {boolean} האם הטקסט השתנה
 */
export function replaceFieldValue(el, newValue, onFallback) {
  const scrollTop = el.scrollTop
  const changed = applyFieldEdit(el, (value) => {
    const range = changedRange(value, newValue)
    const caret = range ? range.from + range.text.length : Math.min(el.selectionEnd, newValue.length)
    return { value: newValue, start: caret, end: caret }
  }, onFallback)
  el.scrollTop = scrollTop
  return changed
}

/**
 * החלפת הבחירה הנוכחית בטקסט (החלף — המופע הנוכחי) — אותו מסלול בטוח כמו replaceFieldValue.
 * @returns {boolean}
 */
export function replaceFieldSelection(el, text, onFallback) {
  return applyFieldEdit(el, (value, start, end) => {
    const caret = start + text.length
    return { value: value.slice(0, start) + text + value.slice(end), start: caret, end: caret }
  }, onFallback)
}

/**
 * הכנסת בלוק (למשל קוד תמונה מוטמעת) במקום הסמן: בשורה משלו — מעבר שורה לפניו אם הסמן לא
 * בתחילת שורה, ואחריו אם הסמן לא בסוף שורה. בחירה — מוחלפת. טהור (לשימוש ב-applyFieldEdit).
 * @returns {{ value: string, start: number, end: number }}
 */
export function insertBlockAt(value, start, end, block) {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const pre = before && !before.endsWith('\n') ? '\n' : ''
  const post = after && !after.startsWith('\n') ? '\n' : ''
  const caret = before.length + pre.length + block.length
  return { value: before + pre + block + post + after, start: caret, end: caret }
}

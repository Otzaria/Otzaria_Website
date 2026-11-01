// "שדה הטקסט" של עורך העמוד: <textarea> (תצוגת קוד) או RichTextArea (תצוגה מעוצבת — div עם
// contenteditable שחושף ממשק תואם-textarea: value, selectionStart/End, setSelectionRange).
// כל מי שמחפש את השדה (page.jsx, useWordTracking, useScanFollow, useCaretPosition...) עובר דרך
// כאן, כדי ששני סוגי השדה יימצאו באותה דרך.

/** התכונה שמסמנת את השדה המעוצב */
export const RICH_FIELD_ATTR = 'data-rich-textarea'

const FIELD = `textarea, [${RICH_FIELD_ATTR}]`

/**
 * האם האלמנט הוא שדה טקסט של העורך (textarea או השדה המעוצב).
 * @param {unknown} el
 * @returns {boolean}
 */
export function isEditorField(el) {
  if (!el || typeof el !== 'object') return false
  const e = /** @type {Element} */ (el)
  return e.tagName === 'TEXTAREA' || (typeof e.hasAttribute === 'function' && e.hasAttribute(RICH_FIELD_ATTR))
}

/**
 * ה-selector של שדה הטור: 'right'/'left' — לפי data-column; אחרת — בלי data-column.
 * @param {'right'|'left'|'content'|null|undefined} column
 */
export function editorFieldSelector(column) {
  if (column === 'right' || column === 'left') return `textarea[data-column="${column}"], [${RICH_FIELD_ATTR}][data-column="${column}"]`
  return `textarea:not([data-column]), [${RICH_FIELD_ATTR}]:not([data-column])`
}

/**
 * השדה של הטור בתוך root (ברירת מחדל: המסמך). בלי טור — השדה הראשי, ואם אין — הראשון.
 * @param {ParentNode|null|undefined} root
 * @param {'right'|'left'|'content'|null} [column]
 * @returns {HTMLElement|null}
 */
export function queryEditorField(root, column = null) {
  const r = root || (typeof document !== 'undefined' ? document : null)
  if (!r?.querySelector) return null
  if (column === 'right' || column === 'left') return r.querySelector(editorFieldSelector(column))
  return r.querySelector(editorFieldSelector(null)) || r.querySelector(FIELD)
}

/** כל שדות העורך בתוך root */
export function queryAllEditorFields(root) {
  return root?.querySelectorAll ? [...root.querySelectorAll(FIELD)] : []
}

/**
 * ה-API הנוסף של השדה המעוצב (undo/redo, מדידות מיקום) — null ל-textarea רגיל.
 * @param {unknown} el
 * @returns {null | {
 *   undo: () => boolean, redo: () => boolean, canUndo: () => boolean, canRedo: () => boolean, replaceRange: (from: number, to: number, text: string) => void,
 *   caretTop: (pos: number) => number|null, caretRowY: (pos: number) => number|null,
 *   offsetAtY: (y: number) => number|null, lineMidY: (line: number) => number|null
 * }}
 */
export function richFieldApi(el) {
  // מאפיין שה-RichTextArea מצמיד לאלמנט
  return (el && /** @type {any} */ (el).__richTextarea) || null
}

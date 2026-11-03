// היכן מותר לקיצור מקלדת של עמוד העריכה לפעול (handleGlobalKeyDown ב-page.jsx).
// - קיצורי עיצוב/עריכת טקסט (מודגש, כותרת, ניקוי עיצוב...) — רק כשהפוקוס בשדה הטקסט של העורך:
//   Ctrl+B בשדה החיפוש לא אמור להדגיש טקסט בעורך.
// - שאר הקיצורים (שמירה, זום, פיצול...) — מכל מקום בעמוד, אבל לא מתוך חלון (dialog) ולא בזמן
//   הקלדה בשדה אחר (שדה החיפוש, שם הטור...).
// - חלון הפקודות — גם משדה אחר, אבל לא מתוך חלון.

/** פעולות שעורכות את הטקסט בשדה הפעיל */
export const EDITOR_TEXT_ACTIONS = new Set([
  'bold', 'italic', 'underline', 'h1', 'h2', 'h3', 'bigger', 'smaller', 'clearFormatting'
])

/** פעולות שמותרות גם כשהפוקוס בשדה קלט אחר (לא בתוך חלון) */
const ANYWHERE_ACTIONS = new Set(['commandPalette'])

/**
 * @typedef {{ inEditorField: boolean, inOtherField: boolean, inDialog: boolean }} ShortcutContext
 */

/**
 * @param {string} actionId
 * @param {ShortcutContext} ctx
 * @returns {boolean}
 */
export function shortcutAllowed(actionId, ctx) {
  if (EDITOR_TEXT_ACTIONS.has(actionId)) return ctx.inEditorField
  if (ctx.inEditorField) return true
  if (ctx.inDialog) return false
  if (ANYWHERE_ACTIONS.has(actionId)) return true
  return !ctx.inOtherField
}

const NON_TEXT_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'])

/**
 * ההקשר של אירוע המקלדת לפי היעד שלו.
 * @param {EventTarget|null} target
 * @returns {ShortcutContext}
 */
export function shortcutContext(target) {
  const el = target && typeof (/** @type {any} */ (target)).closest === 'function' ? /** @type {Element} */ (target) : null
  if (!el) return { inEditorField: false, inOtherField: false, inDialog: false }
  const field = el.closest('textarea, [data-rich-textarea]')
  const inEditorField = !!field && !!field.closest('.editor-container')
  let inOtherField = false
  if (!inEditorField) {
    const tag = el.tagName
    if (tag === 'TEXTAREA' || tag === 'SELECT') inOtherField = true
    else if (tag === 'INPUT') inOtherField = !NON_TEXT_INPUTS.has(String(/** @type {HTMLInputElement} */ (el).type).toLowerCase())
    else inOtherField = !!el.closest('[contenteditable=""], [contenteditable="true"]')
  }
  const inDialog = !!el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')
  return { inEditorField, inOtherField, inDialog }
}

// היסטוריית הביטול של תצוגת הקוד (ה-textarea של העורך) — אותה מחסנית כמו בתצוגה המעוצבת
// (richHistory.js), במקום ההיסטוריה המובנית של הדפדפן. הסיבות:
// 1. ב-textarea מבוקר (React) הדפדפן מבטל תו-אחר-תו; כאן הקלדה רצופה מתאחדת לצעד (עד רווח,
//    הפסקה, תזוזת סמן או סוג עריכה אחר) — בדיוק כמו בתצוגה המעוצבת.
// 2. את ההיסטוריה המובנית אי אפשר לשאול "יש מה לבטל?"; כאן יש עומק אמיתי (canUndo/canRedo),
//    כך שכפתורי הביטול/ביצוע מחדש מושבתים בדיוק כשאין מה לבטל.
//
// המחסנית שייכת לשדה הלוגי (data-column: content/right/left — fieldHistoryStore.js), לא לאלמנט:
// אחרי מעבר תצוגה ה-textarea החדש ממשיך את המחסנית של התצוגה המעוצבת, ולהפך.
// עריכה מבחוץ (React קבע ערך חדש — טעינה, החלפה בקוד בלי אירוע) מנקה את ההיסטוריה, כמו
// syncValue בתצוגה המעוצבת: התמונות שבמחסנית כבר לא תואמות את הטקסט.

import { fieldHistoryEntry, runStructural, syncFieldValue } from './fieldHistoryStore'
import { RICH_FIELD_ATTR, richFieldApi } from '@/lib/editor/editorField'
import { changedRange } from '@/lib/editor/formatToggle'

const SINGLE_GRAPHEME = /^.\p{M}*$/su

/** @typedef {{ undo: () => boolean, redo: () => boolean, canUndo: () => boolean, canRedo: () => boolean }} FieldHistory */

// מצב האלמנט עצמו (הרכבת IME, beforeinput שקדם) — ההיסטוריה עצמה של השדה הלוגי
/** @type {WeakMap<HTMLTextAreaElement, { composing: boolean, sawBefore: boolean }>} */
const flags = new WeakMap()

/** @param {HTMLTextAreaElement} ta */
function entryOf(ta) {
  return fieldHistoryEntry(ta.getAttribute('data-column'))
}

/** @param {HTMLTextAreaElement} ta */
function flagsOf(ta) {
  let f = flags.get(ta)
  if (!f) {
    f = { composing: false, sawBefore: false }
    flags.set(ta, f)
  }
  return f
}

/** @param {HTMLTextAreaElement} ta */
function stateOf(ta) {
  const entry = entryOf(ta)
  // הערך שונה ממה שהשדה ידוע בו — עריכה מבחוץ: ההיסטוריה כבר לא רלוונטית
  syncFieldValue(entry, ta.value)
  return entry
}

/** קביעת ערך כך ש-React (textarea מבוקר) יקבל onChange: ה-setter המקורי + אירוע input */
function applyValue(ta, value, inputType) {
  const proto = Object.getPrototypeOf(ta)
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(ta, value)
  else ta.value = value
  const Ev = ta.ownerDocument.defaultView?.InputEvent
  const ev = typeof Ev === 'function'
    ? new Ev('input', { bubbles: true, inputType })
    : new Event('input', { bubbles: true })
  ta.dispatchEvent(ev)
}

/**
 * סוג העריכה לקיבוץ — כמו ב-richController: תו מוקלד בלי בחירה ('type'), מחיקת תו ('del'), אחר.
 * רווח מוקלד מצטרף למילה שלפניו (וסוגר אותה — onBeforeInput), כמו בביטול המובנה של הדפדפן.
 * @param {string} inputType @param {string|null} data @param {boolean} collapsed
 */
export function editKind(inputType, data, collapsed) {
  if (inputType === 'insertText' && data != null && collapsed && SINGLE_GRAPHEME.test(data) && data !== '\n') return 'type'
  if ((inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') && collapsed) return 'del'
  return 'other'
}

/**
 * תמונת המצב לביטול של עריכה תוכנתית (execCommand('insertText') — מודגש, החלפה, החלף הכול,
 * כותרת, איות...): Chrome לא שולח עליה beforeinput, כך שרק ב-input מתגלה שהערך השתנה. הערך הקודם
 * ידוע (state.value); הבחירה — הטווח שהוחלף בערך הקודם (הסמן המקורי כבר לא ידוע).
 * @param {string} prev @param {string} next
 * @returns {{ value: string, start: number, end: number } | null}
 */
export function programmaticSnapshot(prev, next) {
  const range = changedRange(prev, next)
  if (!range) return null
  return { value: prev, start: range.from, end: range.to }
}

/** האם אירוע המקלדת הוא ביטול / ביצוע מחדש (Ctrl/⌘+Z, Ctrl+Y, Ctrl+Shift+Z) */
export function historyKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const k = String(e.key || '').toLowerCase()
  const z = e.code === 'KeyZ' || k === 'z'
  const y = e.code === 'KeyY' || k === 'y'
  if (z && !e.shiftKey) return 'undo'
  if (y || (z && e.shiftKey)) return 'redo'
  return null
}

/**
 * ה-API של היסטוריית ה-textarea (לכפתורי הסרגל ולחלון הפקודות).
 * @param {HTMLTextAreaElement} ta
 * @returns {FieldHistory}
 */
export function textareaHistoryApi(ta) {
  const step = (dir) => {
    const s = stateOf(ta)
    const current = { value: ta.value, start: ta.selectionStart, end: ta.selectionEnd }
    const snap = dir === 'undo' ? s.history.undo(current) : s.history.redo(current)
    if (!snap) return false
    // צעד מבני (ביטול איחוד טורים) — ההורה משחזר את המבנה
    if (runStructural(s, snap)) return true
    s.value = snap.value
    applyValue(ta, snap.value, dir === 'undo' ? 'historyUndo' : 'historyRedo')
    ta.setSelectionRange(snap.start, snap.end)
    return true
  }
  return {
    undo: () => step('undo'),
    redo: () => step('redo'),
    canUndo: () => stateOf(ta).history.canUndo(),
    canRedo: () => stateOf(ta).history.canRedo()
  }
}

/**
 * היסטוריית הביטול של שדה עורך כלשהו: המעוצב (richController) או ה-textarea (כאן).
 * @param {unknown} el
 * @returns {FieldHistory|null}
 */
export function editorFieldHistory(el) {
  const rich = richFieldApi(el)
  if (rich) return rich.canUndo ? /** @type {FieldHistory} */ (/** @type {unknown} */ (rich)) : null
  if (el && /** @type {Element} */ (el).tagName === 'TEXTAREA') return textareaHistoryApi(/** @type {HTMLTextAreaElement} */ (el))
  return null
}

/**
 * מתקין את ההיסטוריה על כל textarea של העורך בתוך המכל (מאזינים ב-capture על המסמך — ה-textarea-ים
 * נוצרים ונהרסים). השדה המעוצב מנהל היסטוריה בעצמו — מדלגים עליו.
 * @param {Document} doc
 * @param {() => HTMLElement|null} getContainer
 * @returns {() => void} הסרה
 */
export function installTextareaHistory(doc, getContainer) {
  /** @returns {HTMLTextAreaElement|null} */
  const fieldOf = (t) => {
    if (!t || t.tagName !== 'TEXTAREA' || t.hasAttribute?.(RICH_FIELD_ATTR)) return null
    return getContainer()?.contains(t) ? t : null
  }

  const onBeforeInput = (e) => {
    const ta = fieldOf(e.target)
    if (!ta) return
    const t = e.inputType
    // ה-input הבא שייך לאירוע הזה (ולא לעריכה תוכנתית בלי beforeinput). אם האירוע בוטל ואין
    // input — הסימון פג בסוף המשימה הנוכחית
    stateOf(ta)
    const fl = flagsOf(ta)
    fl.sawBefore = true
    setTimeout(() => { fl.sawBefore = false }, 0)
    if (t === 'historyUndo' || t === 'historyRedo') {
      // ביטול מהתפריט/מהדפדפן — דרך המחסנית שלנו, לא ההיסטוריה המובנית
      e.preventDefault()
      textareaHistoryApi(ta)[t === 'historyUndo' ? 'undo' : 'redo']()
      return
    }
    const s = stateOf(ta)
    if (t === 'insertCompositionText') return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const kind = editKind(t, e.data ?? null, start === end)
    if (kind === 'other') s.history.breakGroup()
    s.history.record({ value: ta.value, start, end }, kind, Date.now())
    // רווח/מעבר שורה — סוף מילה: ההקלדה הבאה מתחילה צעד חדש
    if (kind === 'other' || (typeof e.data === 'string' && /\s/.test(e.data))) s.history.breakGroup()
  }
  const onInput = (e) => {
    const ta = fieldOf(e.target)
    if (!ta) return
    const s = entryOf(ta)
    const fl = flagsOf(ta)
    if (s.value === null) {
      // עריכה תוכנתית ראשונה בשדה שעוד לא נגעו בו — הערך הקודם כבר לא ידוע; מעתה נעקב
      stateOf(ta)
      return
    }
    if (fl.composing) return
    if (!fl.sawBefore && ta.value !== s.value) {
      // input בלי beforeinput — execCommand('insertText') של פעולה תוכנתית: צעד ביטול נפרד ('other'
      // — לא מתאחד עם ההקלדה שלפניו ואחריו, גם כשהוכנסה אות בודדת)
      const snap = programmaticSnapshot(s.value, ta.value)
      if (snap) {
        s.history.breakGroup()
        s.history.record(snap, 'other', Date.now())
        s.history.breakGroup()
      }
    }
    fl.sawBefore = false
    s.value = ta.value
  }
  const onCompStart = (e) => {
    const ta = fieldOf(e.target)
    if (!ta) return
    const s = stateOf(ta)
    s.history.breakGroup()
    s.history.record({ value: ta.value, start: ta.selectionStart, end: ta.selectionEnd }, 'other', Date.now())
    s.history.breakGroup()
    flagsOf(ta).composing = true
  }
  const onCompEnd = (e) => {
    const ta = fieldOf(e.target)
    if (!ta) return
    const s = entryOf(ta)
    flagsOf(ta).composing = false
    if (s.value === null) return
    s.value = ta.value
  }
  const onKeyDown = (e) => {
    const ta = fieldOf(e.target)
    if (!ta || e.defaultPrevented) return
    const cmd = historyKey(e)
    if (cmd) {
      e.preventDefault()
      textareaHistoryApi(ta)[cmd]()
      return
    }
    // תזוזת סמן במקלדת — סוף צעד
    if (/^(Arrow|Home|End|Page)/.test(e.key)) entryOf(ta).history.breakGroup()
  }
  // מעקב מרגע הפוקוס — כדי שגם עריכה תוכנתית ראשונה (Ctrl+B מיד אחרי פתיחה) תדע את הערך הקודם
  const onFocusIn = (e) => {
    const ta = fieldOf(e.target)
    if (ta) stateOf(ta)
  }
  const onPointerDown = (e) => {
    const ta = fieldOf(e.target)
    if (ta) entryOf(ta).history.breakGroup()
  }

  /** @type {[string, (e: any) => void][]} */
  const listeners = [
    ['beforeinput', onBeforeInput],
    ['input', onInput],
    ['compositionstart', onCompStart],
    ['compositionend', onCompEnd],
    ['keydown', onKeyDown],
    ['pointerdown', onPointerDown],
    ['focusin', onFocusIn]
  ]
  for (const [name, fn] of listeners) doc.addEventListener(name, fn, true)
  return () => {
    for (const [name, fn] of listeners) doc.removeEventListener(name, fn, true)
  }
}

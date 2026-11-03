// לוגיקה טהורה של מעטפת העורך החדש (EditorShell, הסרגלים, סרגל הנייד) — בלי DOM ובלי React,
// כדי שתיבדק לבד (editorShellLogic.test.js).

import { formatShortcut } from '@/lib/shortcuts'

/** מצב השמירה של useAutoSave ('unsaved') → המצב של EditorTopBar / FinishPageDialog ('dirty') */
export function toUiSaveStatus(status) {
  if (status === 'unsaved') return 'dirty'
  if (status === 'saving' || status === 'error' || status === 'saved') return status
  return 'saved'
}

/** בערכת "ערב" הצילום מעומעם (ולא הפוך — היפוך של סריקה ישנה מעוות כתמים ודיו) */
export const EVENING_SCAN_DIM = 0.85

/**
 * filter של CSS לפאנל הצילום, לפי בהירות/ניגודיות (באחוזים) והערכה.
 * ברירת המחדל (100/100 בערכה בהירה) — 'none', כדי לא ליצור שכבת קומפוזיציה בלי צורך.
 */
export function scanFilterCss({ scanBrightness = 100, scanContrast = 100, theme = 'light' } = {}) {
  const dim = theme === 'evening' ? EVENING_SCAN_DIM : 1
  const brightness = Math.round(scanBrightness * dim) / 100
  const contrast = scanContrast / 100
  if (brightness === 1 && contrast === 1) return 'none'
  return `brightness(${brightness}) contrast(${contrast})`
}

/** שורת הדוגמה: האותיות שמתבלבלות בהקלדה מצילום */
export const CONFUSABLE_SAMPLE = 'ו ז ן · ד ר · ה ח ת · ב כ · ס ם'

/** מילה מנוקדת עם טעם (טפחא) — לראות אם הגופן מציג ניקוד וטעמים במקומם */
export const NIQQUD_SAMPLE = 'בְּרֵאשִׁ֖ית'

/**
 * גופני ההקלדה (EDITOR_FONTS ב-hooks/editorPrefs.js) — תווית, קבוצה (serif: עם תגים) ו-font-family.
 * - frank: Frank Ruehl CLM (סריף, ברירת המחדל).
 * - sans: font-family: sans-serif בלבד — גופן ה-sans של המערכת (ב-Windows בדרך כלל Arial), בלי
 *   גופן רשת. זו הבחירה שהמשתמשים ביקשו ("Sans Serif"), ולכן היא ראשונה בקבוצה ויעד פקודת ההחלפה.
 * - assistant: גופן הממשק של האתר — כבר טעון, בלי הורדה נוספת. אין בו טעמים.
 * - noto: Noto Sans Hebrew (next/font/local ב-layout.tsx, בלי preload) — מכסה ניקוד וטעמים במלואם.
 * - ibmPlex / googleSans / openSans: IBM Plex Sans Hebrew, Google Sans, Open Sans (מקומיים, OFL, בלי
 *   preload). ב-IBM Plex וב-Open Sans אין טעמים — אחריהם נוטו בשרשרת, כדי שהטעמים (וסימני ניקוד
 *   נדירים שחסרים בהם) ייפלו לגופן שתומך בהם ולא לריבוע. ב-Google Sans יש ניקוד וטעמים מלאים.
 */
export const EDITOR_FONT_OPTIONS = [
  { value: 'frank', label: 'פרנק ריהל', serif: true, hint: 'כמו בספר המודפס', css: 'var(--font-frank)' },
  { value: 'sans', label: 'Sans Serif', serif: false, hint: 'גופן המערכת', css: 'sans-serif' },
  { value: 'assistant', label: 'אסיסטנט', serif: false, hint: 'גופן האתר', css: 'var(--font-sans)' },
  { value: 'noto', label: 'נוטו סנס עברי', serif: false, hint: 'תומך גם בטעמים', css: 'var(--font-noto-hebrew), var(--font-sans)' },
  { value: 'ibmPlex', label: 'IBM Plex', serif: false, hint: 'בלי טעמים', css: 'var(--font-ibm-plex-hebrew), var(--font-noto-hebrew), var(--font-sans)' },
  { value: 'googleSans', label: 'Google Sans', serif: false, hint: 'תומך גם בטעמים', css: 'var(--font-google-sans), var(--font-noto-hebrew), var(--font-sans)' },
  { value: 'openSans', label: 'Open Sans', serif: false, hint: 'בלי טעמים', css: 'var(--font-open-sans), var(--font-noto-hebrew), var(--font-sans)' }
]

/** גופן "בלי תגים" שמוחלפים אליו מפקודת ההחלפה — sans-serif של המערכת (בקשת המשתמשים) */
export const DEFAULT_SANS_EDITOR_FONT = 'sans'

const fontOption = (fontFamily) => EDITOR_FONT_OPTIONS.find((o) => o.value === fontFamily)

/** גופן ההקלדה (מההעדפות) → font-family של ה-textarea (טוקני הגופן של האתר); לא מוכר — גופן האתר */
export function editorFontFamily(fontFamily) {
  return fontOption(fontFamily)?.css ?? 'var(--font-sans)'
}

/** האם גופן ההקלדה הוא עם תגים (סריף) */
export function isSerifEditorFont(fontFamily) {
  return !!fontOption(fontFamily)?.serif
}

/** החלפה עם תגים ↔ בלי תגים: מסריף לגופן ה-sans המועדף, מכל sans לפרנק ריהל */
export function toggledEditorFont(fontFamily) {
  return isSerifEditorFont(fontFamily) ? DEFAULT_SANS_EDITOR_FONT : 'frank'
}

/**
 * גובה השורה בטקסט (העדפה lineHeight, מגרסה 6). "רגיל" (2) — הגובה של ברירת המחדל הקודמת
 * ("מול הסריקה"); "צפוף" (1.6) — קרוב לריווח של העורך הישן (leading-relaxed, 1.625).
 * חל על ה-textarea, על שכבת ה-mirror ועל התצוגה המעוצבת יחד — מאותו משתנה CSS.
 */
export const LINE_HEIGHT = { compact: 1.6, normal: 2, relaxed: 2.4, loose: 2.8 }

/** הרווח בין פסקאות (שורות לוגיות) בתצוגה המעוצבת, ב-em של גודל הגופן (העדפה paraSpacing) */
export const PARA_GAP_EM = { none: 0, small: 0.4, medium: 0.8, large: 1.4 }

/** תוויות ריווח השורות — משותפות לגיליון התצוגה ולחלון הפקודות */
export const LINE_HEIGHT_OPTIONS = [
  { value: 'compact', label: 'צפוף' },
  { value: 'normal', label: 'רגיל' },
  { value: 'relaxed', label: 'מרווח' },
  { value: 'loose', label: 'מרווח מאוד' }
]

/** תוויות הרווח בין פסקאות — משותפות לגיליון התצוגה ולחלון הפקודות */
export const PARA_SPACING_OPTIONS = [
  { value: 'none', label: 'בלי' },
  { value: 'small', label: 'קטן' },
  { value: 'medium', label: 'בינוני' },
  { value: 'large', label: 'גדול' }
]

/** משתני ה-CSS שמעטפת העורך שמה על השורש — הטקסט קורא אותם דרך editor-themes.css ו-richStyles.js */
export function editorStyleVars({ lineHeight = 'normal', paraSpacing = 'none' } = {}) {
  return {
    '--editor-text-line-height': String(LINE_HEIGHT[lineHeight] ?? LINE_HEIGHT.normal),
    '--editor-para-gap': `${PARA_GAP_EM[paraSpacing] ?? 0}em`
  }
}

export const IMAGE_ZOOM = { min: 25, max: 300, step: 10 }

export function clampZoom(zoom) {
  return Math.min(IMAGE_ZOOM.max, Math.max(IMAGE_ZOOM.min, Math.round(zoom)))
}

/**
 * הזום (באחוזים) שבו הצילום ממלא את רוחב הפאנל. חסר מידע (תמונה שעוד לא נטענה) → null.
 *
 * @param {{ containerWidth: number, imageWidth: number, padding?: number }} input
 */
export function fitZoomPercent({ containerWidth, imageWidth, padding = 0 }) {
  const available = containerWidth - padding
  if (!(imageWidth > 0) || !(available > 0)) return null
  return clampZoom(Math.floor((available / imageWidth) * 100))
}

/**
 * מעבר לשורה הקודמת/הבאה בטקסט (סרגל הנייד): מחזיר את מיקום הסמן החדש, באותה עמודה ככל
 * האפשר (שורה קצרה — סוף השורה). בשורה הראשונה/האחרונה — המיקום לא משתנה.
 *
 * @param {string} text
 * @param {number} pos מיקום הסמן הנוכחי
 * @param {-1 | 1} direction
 */
export function caretLineJump(text, pos, direction) {
  const value = text ?? ''
  const at = Math.min(Math.max(0, pos | 0), value.length)
  const lineStart = value.lastIndexOf('\n', at - 1) + 1
  const column = at - lineStart
  if (direction < 0) {
    if (lineStart === 0) return at
    const prevStart = value.lastIndexOf('\n', lineStart - 2) + 1
    const prevLength = lineStart - 1 - prevStart
    return prevStart + Math.min(column, prevLength)
  }
  const lineEnd = value.indexOf('\n', at)
  if (lineEnd === -1) return at
  const nextStart = lineEnd + 1
  const nextEndRaw = value.indexOf('\n', nextStart)
  const nextEnd = nextEndRaw === -1 ? value.length : nextEndRaw
  return nextStart + Math.min(column, nextEnd - nextStart)
}

export const PANEL_SIZE = { min: 20, max: 80, step: 2 }

/**
 * גודל פאנל הצילום אחרי מקש במפריד (באחוזים). בפריסה זה-לצד-זה (RTL): הצילום בימין, ולכן
 * חץ שמאלה מגדיל אותו; בהחלפת צדדים — להפך. בפריסה אחד-מעל-השני: חץ למטה מגדיל את העליון.
 * Home/End — המינימום/המקסימום. מקש אחר → null (לא מטופל).
 *
 * @param {number} size
 * @param {string} key KeyboardEvent.key
 * @param {{ orientation?: 'vertical'|'horizontal', swap?: boolean }} layout
 */
export function nudgePanelSize(size, key, { orientation = 'vertical', swap = false } = {}) {
  const clamp = (v) => Math.min(PANEL_SIZE.max, Math.max(PANEL_SIZE.min, v))
  if (key === 'Home') return PANEL_SIZE.min
  if (key === 'End') return PANEL_SIZE.max
  let delta = 0
  if (orientation === 'horizontal') {
    if (key === 'ArrowDown') delta = PANEL_SIZE.step
    else if (key === 'ArrowUp') delta = -PANEL_SIZE.step
  } else if (key === 'ArrowLeft') delta = PANEL_SIZE.step
  else if (key === 'ArrowRight') delta = -PANEL_SIZE.step
  if (!delta) return null
  return clamp(size + (swap ? -delta : delta))
}

/** צירוף שמור ("Ctrl+KeyH") → מקשים לתצוגה (['Ctrl', 'H']); בלי צירוף — undefined */
export function shortcutKeys(combo) {
  if (!combo) return undefined
  const formatted = formatShortcut(combo)
  return formatted ? formatted.split('+') : undefined
}

const ARIA_KEY_NAMES = { Ctrl: 'Control', Cmd: 'Meta', Esc: 'Escape', Del: 'Delete', '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight', '+': 'Plus' }

/**
 * מקשי קיצור לתצוגה (['Ctrl', 'Shift', 'I'], מ-shortcutKeys) → ערך aria-keyshortcuts
 * ("Control+Shift+I"). בלי מקשים — undefined (בלי התכונה).
 */
export function toAriaKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return undefined
  return keys.map((k) => ARIA_KEY_NAMES[k] ?? k).join('+')
}

// תגי עיצוב בתוך שורה (<b>, <big>...) לא מפרידים בין מילים — "ו<b>גדול</b>" היא מילה אחת; שאר התגים
// (<h2>, <br>, <p>...) כן מפרידים
const INLINE_TAG = /<\/?(?:b|i|u|s|em|strong|big|small|span|sup|sub|mark|font)(?=[\s/>])[^>]{0,20}>/gi
const OTHER_TAG = /<[^>]{1,20}>/g
function stripTags(text) {
  return text.replace(INLINE_TAG, '').replace(OTHER_TAG, ' ')
}

/** מספר המילים בטקסט (רצפים בלי רווח; תגי HTML כמו <b> לא נספרים כמילה נפרדת) */
export function countWords(text) {
  if (!text) return 0
  const stripped = stripTags(text)
  const words = stripped.match(/\S+/g)
  return words ? words.length : 0
}

/** מספר השורות בטקסט (שורות ריקות בסוף לא נספרות) */
export function countLines(text) {
  if (!text) return 0
  const trimmed = text.replace(/\s+$/, '')
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

/**
 * מיקום הסמן → מספר שורה (מ-1), מספר המילה בשורה (מ-1; לפני המילה הראשונה — 1), ומספר המילה
 * בכל הטקסט (pageWord) מתוך totalWords — באותה ספירה כמו countWords (תגים לא נספרים כמילה)
 */
export function caretPosition(text, pos) {
  const value = text ?? ''
  const at = Math.min(Math.max(0, pos | 0), value.length)
  const before = value.slice(0, at)
  const line = before.split('\n').length
  const lineStart = before.lastIndexOf('\n') + 1
  const lineBefore = value.slice(lineStart, at)
  const words = lineBefore.match(/\S+/g)
  const word = words ? words.length + (/\s$/.test(lineBefore) ? 1 : 0) : 1
  const totalWords = countWords(value)
  const strippedBefore = stripTags(before)
  const wordsBefore = strippedBefore.match(/\S+/g)
  const pageWord = wordsBefore ? wordsBefore.length + (/\s$/.test(strippedBefore) ? 1 : 0) : 1
  return { line, totalLines: Math.max(1, value.split('\n').length), word, pageWord: Math.min(pageWord, Math.max(1, totalWords)), totalWords }
}

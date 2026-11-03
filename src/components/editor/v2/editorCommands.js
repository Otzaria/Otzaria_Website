// רשימת הפקודות של חלון הפקודות (Ctrl+K) בעורך העמוד — לוגיקה טהורה (editorCommands.test.js).
// כל הפעולות הנדירות שהיו בסרגל הכלים הישן נמצאות כאן, בארבע קבוצות: עריכה, צילום, פריסה ומצבים, עמוד.
// הקיצור שליד כל פקודה נלקח ממפת הקיצורים של המשתמש (actionId ↔ keyboardShortcutMatching), כך
// שקיצור שהותאם בחלון "קיצורי מקלדת" מוצג גם כאן.

import { EDITOR_FONT_OPTIONS, LINE_HEIGHT_OPTIONS, PARA_SPACING_OPTIONS, isSerifEditorFont, shortcutKeys } from './editorShellLogic'

export const COMMAND_GROUPS = {
  edit: 'עריכה',
  scan: 'צילום',
  layout: 'פריסה ומצבים',
  page: 'עמוד'
}

const noop = () => {}

/**
 * @param {{
 *   shortcuts?: Record<string, string>,
 *   state?: {
 *     twoColumns?: boolean, hasImage?: boolean, canUndo?: boolean, canRedo?: boolean,
 *     isFullScreen?: boolean, layoutOrientation?: 'vertical'|'horizontal',
 *     fontFamily?: string, lineHeight?: string, paraSpacing?: string, canDetectWords?: boolean, wordDetecting?: boolean, textView?: 'rich'|'code',
 *     canClaim?: boolean, canRelease?: boolean, canFinish?: boolean,
 *   },
 *   run?: Record<string, Function>
 * }} input
 * @returns {import('@/components/ui/commandPaletteFilter').PaletteCommand[]}
 */
export function buildEditorCommands({ shortcuts = {}, state = {}, run = {} } = {}) {
  const fn = (name, ...args) => {
    const handler = run[name]
    return typeof handler === 'function' ? () => handler(...args) : noop
  }
  // האייקון והפעולה באובייקט (icon: '...') — כך סורק גופן האייקונים (iconFontScan) מוצא אותם
  const cmd = (group, id, label, { icon, run: runFn, actionId, keywords, disabled }) => ({
    id,
    group: COMMAND_GROUPS[group],
    label,
    icon,
    run: runFn,
    shortcut: actionId ? shortcutKeys(shortcuts[actionId]) : undefined,
    keywords,
    disabled: Boolean(disabled)
  })

  const noImage = !state.hasImage

  return [
    // ---------- עריכה ----------
    cmd('edit', 'findReplace', 'חיפוש והחלפה', { icon: 'find_replace', run: fn('findReplace'), actionId: 'findReplace', keywords: ['חפש', 'החלף'] }),
    cmd('edit', 'runSavedSearches', 'הרצת החיפושים הקבועים', { icon: 'playlist_play', run: fn('runSavedSearches'), actionId: 'runSavedSearches' }),
    cmd('edit', 'spellcheck', 'בדיקת איות', { icon: 'spellcheck', run: fn('spellcheck'), keywords: ['שגיאות'] }),
    cmd('edit', 'undo', 'ביטול', { icon: 'undo', run: fn('undo'), keywords: ['undo'], disabled: state.canUndo === false }),
    cmd('edit', 'redo', 'ביצוע מחדש', { icon: 'redo', run: fn('redo'), keywords: ['redo'], disabled: state.canRedo === false }),
    cmd('edit', 'bold', 'הדגשה', { icon: 'format_bold', run: fn('insertTag', 'b'), actionId: 'bold', keywords: ['מודגש', 'בולד'] }),
    cmd('edit', 'italic', 'נטוי', { icon: 'format_italic', run: fn('insertTag', 'i'), actionId: 'italic' }),
    cmd('edit', 'underline', 'קו תחתון', { icon: 'format_underlined', run: fn('insertTag', 'u'), actionId: 'underline' }),
    cmd('edit', 'h1', 'כותרת רמה 1', { icon: 'title', run: fn('insertTag', 'h1'), actionId: 'h1', keywords: ['h1'] }),
    cmd('edit', 'h2', 'כותרת רמה 2', { icon: 'title', run: fn('insertTag', 'h2'), actionId: 'h2', keywords: ['h2'] }),
    cmd('edit', 'h3', 'כותרת רמה 3', { icon: 'title', run: fn('insertTag', 'h3'), actionId: 'h3', keywords: ['h3'] }),
    cmd('edit', 'bigger', 'הגדלת קטע', { icon: 'text_increase', run: fn('insertTag', 'big'), actionId: 'bigger', keywords: ['big'] }),
    cmd('edit', 'smaller', 'הקטנת קטע', { icon: 'text_decrease', run: fn('insertTag', 'small'), actionId: 'smaller', keywords: ['small'] }),
    cmd('edit', 'clearFormatting', 'נקה עיצוב', { icon: 'format_clear', run: fn('clearFormatting'), actionId: 'clearFormatting', keywords: ['ניקוי', 'הסרת הדגשה', 'רגיל', 'עיצוב'] }),
    cmd('edit', 'imageToText', 'הוספת תמונה לטקסט', { icon: 'image', run: fn('imageToText'), actionId: 'imageToText', keywords: ['תמונה', 'הטמעה'] }),
    cmd('edit', 'removeDigits', 'ניקוי ספרות', { icon: 'cleaning_services', run: fn('removeDigits'), actionId: 'removeDigits', keywords: ['מספרים'] }),
    cmd(
      'edit', 'split',
      state.twoColumns ? 'איחוד לטור אחד' : 'פיצול לשני טורים',
      { icon: state.twoColumns ? 'call_merge' : 'call_split', run: fn('split'), actionId: 'split', keywords: ['טורים', 'פיצול', 'איחוד'] }
    ),
    cmd('edit', 'alignRight', 'יישור לימין', { icon: 'format_align_right', run: fn('align', 'right'), actionId: 'alignRight' }),
    cmd('edit', 'alignCenter', 'יישור למרכז', { icon: 'format_align_center', run: fn('align', 'center'), actionId: 'alignCenter' }),
    cmd('edit', 'alignLeft', 'יישור לשמאל', { icon: 'format_align_left', run: fn('align', 'left'), actionId: 'alignLeft' }),
    cmd('edit', 'alignJustify', 'יישור לשני הצדדים', { icon: 'format_align_justify', run: fn('align', 'justify'), actionId: 'alignJustify' }),

    // ---------- צילום ----------
    cmd('scan', 'detectWords', state.wordDetecting ? 'זיהוי המילים בעמוד רץ…' : 'זהה מילים בעמוד', { icon: 'document_scanner', run: fn('detectWords'), keywords: ['מעקב', 'מילים', 'תיבות', 'מסגרת'], disabled: noImage || state.canDetectWords === false || Boolean(state.wordDetecting) }),
    cmd('scan', 'zoomIn', 'הגדלת הצילום', { icon: 'zoom_in', run: fn('zoomIn'), actionId: 'zoomIn', keywords: ['זום'] }),
    cmd('scan', 'zoomOut', 'הקטנת הצילום', { icon: 'zoom_out', run: fn('zoomOut'), actionId: 'zoomOut', keywords: ['זום'] }),
    cmd('scan', 'zoomFit', 'התאמה לרוחב הפאנל', { icon: 'fit_page_width', run: fn('zoomFit'), keywords: ['זום', 'התאם'] }),
    cmd('scan', 'zoomReset', 'זום 100%', { icon: 'zoom_in', run: fn('zoomReset'), keywords: ['זום', 'מקורי'] }),
    cmd('scan', 'downloadImage', 'הורדת הצילום למחשב', { icon: 'download', run: fn('downloadImage'), keywords: ['תמונה', 'שמירה'], disabled: noImage }),

    // ---------- פריסה ומצבים ----------
    cmd('layout', 'display', 'תצוגה ונוחות עיניים', { icon: 'format_size', run: fn('display'), keywords: ['ערכה', 'ערב', 'גופן', 'בהירות'] }),
    cmd(
      'layout', 'layout',
      state.layoutOrientation === 'horizontal' ? 'צילום וטקסט זה לצד זה' : 'צילום מעל הטקסט',
      { icon: 'splitscreen', run: fn('layout'), actionId: 'layout', keywords: ['פריסה', 'כיוון'] }
    ),
    cmd('layout', 'togglePanel', 'החלפת צדדים (צילום/טקסט)', { icon: 'swap_horiz', run: fn('swapPanels'), actionId: 'togglePanel', keywords: ['צדדים'] }),
    cmd(
      'layout', 'fullScreen',
      state.isFullScreen ? 'יציאה ממסך מלא' : 'מסך מלא',
      { icon: state.isFullScreen ? 'close_fullscreen' : 'fullscreen', run: fn('fullScreen'), actionId: 'fullScreen' }
    ),
    cmd(
      'layout', 'toggleTextView',
      state.textView === 'code' ? 'הצג עיצוב' : 'הצג קוד',
      { icon: state.textView === 'code' ? 'format_bold' : 'code', run: fn('toggleTextView'), actionId: 'toggleTextView', keywords: ['תגים', 'html', 'קוד', 'עיצוב', 'תצוגה'] }
    ),
    cmd(
      'layout', 'toggleFontSerif',
      `החלף גופן: ${isSerifEditorFont(state.fontFamily) ? 'בלי תגים' : 'עם תגים'}`,
      { icon: 'text_fields', run: fn('toggleFontSerif'), keywords: ['גופן', 'תגים', 'סריף', 'עם תגים', 'בלי תגים'] }
    ),
    ...EDITOR_FONT_OPTIONS.map((font) => cmd(
      'layout', `font${font.value[0].toUpperCase()}${font.value.slice(1)}`,
      `גופן ההקלדה: ${font.label} (${font.serif ? 'עם תגים' : 'בלי תגים'})${state.fontFamily === font.value ? ' — נבחר' : ''}`,
      { icon: 'text_fields', run: fn('setFont', font.value), keywords: ['גופן', font.serif ? 'עם תגים' : 'בלי תגים'] }
    )),
    ...LINE_HEIGHT_OPTIONS.map((o) => cmd(
      'layout', `lineHeight${o.value[0].toUpperCase()}${o.value.slice(1)}`,
      `ריווח שורות: ${o.label}${state.lineHeight === o.value ? ' — נבחר' : ''}`,
      { icon: 'unfold_more', run: fn('setLineHeight', o.value), keywords: ['ריווח', 'שורות', 'גובה שורה'] }
    )),
    // רווח בין פסקאות — בתצוגה המעוצבת בלבד (ב-textarea אין דרך להוסיף אותו), כמו בגיליון התצוגה
    ...(state.textView === 'code' ? [] : PARA_SPACING_OPTIONS.map((o) => cmd(
      'layout', `paraSpacing${o.value[0].toUpperCase()}${o.value.slice(1)}`,
      `רווח בין פסקאות: ${o.label}${state.paraSpacing === o.value ? ' — נבחר' : ''}`,
      { icon: 'unfold_more', run: fn('setParaSpacing', o.value), keywords: ['ריווח', 'פסקאות', 'רווח'] }
    ))),
    cmd('layout', 'textZoomIn', 'הגדלת גופן הטקסט', { icon: 'add', run: fn('textZoomIn'), actionId: 'textZoomIn', keywords: ['גודל'] }),
    cmd('layout', 'textZoomOut', 'הקטנת גופן הטקסט', { icon: 'remove', run: fn('textZoomOut'), actionId: 'textZoomOut', keywords: ['גודל'] }),
    cmd('layout', 'shortcuts', 'קיצורי מקלדת', { icon: 'keyboard', run: fn('shortcuts'), actionId: 'shortcuts', keywords: ['מקשים'] }),

    // ---------- עמוד ----------
    cmd('page', 'save', 'שמירה עכשיו', { icon: 'save', run: fn('save'), actionId: 'save' }),
    cmd('page', 'finish', 'סיום עמוד', { icon: 'check', run: fn('finish'), actionId: 'finish', keywords: ['העלאה', 'סיים'], disabled: state.canFinish === false }),
    ...(state.canClaim ? [cmd('page', 'claim', 'תפיסת העמוד לעבודה', { icon: 'lock', run: fn('claim'), keywords: ['תפוס'] })] : []),
    ...(state.canRelease ? [cmd('page', 'release', 'שחרור העמוד', { icon: 'lock_open', run: fn('release'), keywords: ['שחרר'] })] : []),
    cmd('page', 'guidelines', 'הנחיות העריכה לספר', { icon: 'info', run: fn('guidelines'), keywords: ['מידע', 'הוראות'] }),
    cmd('page', 'backToBook', 'חזרה לדף הספר', { icon: 'menu_book', run: fn('backToBook') })
  ]
}

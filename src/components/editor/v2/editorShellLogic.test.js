import { describe, it, expect } from 'vitest'
import { EDITOR_FONTS, LINE_HEIGHTS, PARA_SPACINGS } from '@/hooks/editorPrefs'
import {
  toUiSaveStatus,
  scanFilterCss,
  editorFontFamily,
  EDITOR_FONT_OPTIONS,
  isSerifEditorFont,
  toggledEditorFont,
  editorStyleVars,
  LINE_HEIGHT,
  LINE_HEIGHT_OPTIONS,
  PARA_GAP_EM,
  PARA_SPACING_OPTIONS,
  clampZoom,
  fitZoomPercent,
  caretLineJump,
  nudgePanelSize,
  shortcutKeys,
  countWords,
  countLines,
  caretPosition,
  PANEL_SIZE,
  toAriaKeys
} from './editorShellLogic'

describe('toUiSaveStatus', () => {
  it('unsaved → dirty; השאר כמו שהם; לא מוכר → saved', () => {
    expect(toUiSaveStatus('unsaved')).toBe('dirty')
    expect(toUiSaveStatus('saving')).toBe('saving')
    expect(toUiSaveStatus('error')).toBe('error')
    expect(toUiSaveStatus('saved')).toBe('saved')
    expect(toUiSaveStatus(undefined)).toBe('saved')
  })
})

describe('scanFilterCss', () => {
  it('ברירת מחדל — none', () => {
    expect(scanFilterCss({})).toBe('none')
    expect(scanFilterCss({ scanBrightness: 100, scanContrast: 100, theme: 'paper' })).toBe('none')
  })
  it('בהירות וניגודיות כיחס', () => {
    expect(scanFilterCss({ scanBrightness: 90, scanContrast: 120 })).toBe('brightness(0.9) contrast(1.2)')
  })
  it('בערב — הצילום מעומעם, לא הפוך', () => {
    expect(scanFilterCss({ theme: 'evening' })).toBe('brightness(0.85) contrast(1)')
    expect(scanFilterCss({ theme: 'evening' })).not.toMatch(/invert/)
  })
})

describe('גופן וריווח', () => {
  it('font-family לכל גופן; לא מוכר — גופן האתר', () => {
    expect(editorFontFamily('frank')).toBe('var(--font-frank)')
    expect(editorFontFamily('assistant')).toBe('var(--font-sans)')
    expect(editorFontFamily('noto')).toBe('var(--font-noto-hebrew), var(--font-sans)')
    expect(editorFontFamily('sans')).toBe('sans-serif')
    // בלי טעמים ב-IBM Plex וב-Open Sans — נוטו אחריהם בשרשרת, שהטעמים לא ייצאו ריבוע
    expect(editorFontFamily('ibmPlex')).toBe('var(--font-ibm-plex-hebrew), var(--font-noto-hebrew), var(--font-sans)')
    expect(editorFontFamily('openSans')).toBe('var(--font-open-sans), var(--font-noto-hebrew), var(--font-sans)')
    expect(editorFontFamily('googleSans')).toContain('var(--font-google-sans)')
    expect(editorFontFamily('xxx')).toBe('var(--font-sans)')
  })
  it('כל גופני ההעדפות מוגדרים, ורק פרנק עם תגים', () => {
    expect(EDITOR_FONT_OPTIONS.map((o) => o.value).sort()).toEqual([...EDITOR_FONTS].sort())
    expect(EDITOR_FONT_OPTIONS.filter((o) => o.serif).map((o) => o.value)).toEqual(['frank'])
    expect(isSerifEditorFont('frank')).toBe(true)
    expect(isSerifEditorFont('assistant')).toBe(false)
    expect(isSerifEditorFont('xxx')).toBe(false)
  })
  it('החלפה עם תגים ↔ בלי תגים', () => {
    expect(toggledEditorFont('frank')).toBe('sans')
    expect(toggledEditorFont('noto')).toBe('frank')
    expect(toggledEditorFont('assistant')).toBe('frank')
    expect(toggledEditorFont('sans')).toBe('frank')
    expect(toggledEditorFont('googleSans')).toBe('frank')
  })
  it('ריווח שורות כמשתנה CSS — לפי lineHeight, לא לפי סידור השורות', () => {
    expect(editorStyleVars({ lineHeight: 'compact' })['--editor-text-line-height']).toBe('1.6')
    expect(editorStyleVars({ lineHeight: 'normal' })['--editor-text-line-height']).toBe('2')
    expect(editorStyleVars({ lineHeight: 'relaxed' })['--editor-text-line-height']).toBe('2.4')
    expect(editorStyleVars({ lineHeight: 'loose' })['--editor-text-line-height']).toBe('2.8')
    expect(editorStyleVars({ lineHeight: 'xxx' })['--editor-text-line-height']).toBe('2')
    expect(editorStyleVars({ lineSpacing: 'fixed' })['--editor-text-line-height']).toBe('2')
    expect(editorStyleVars({})['--editor-text-line-height']).toBe('2')
  })
  it('רווח בין פסקאות כמשתנה CSS (em)', () => {
    expect(editorStyleVars({})['--editor-para-gap']).toBe('0em')
    expect(editorStyleVars({ paraSpacing: 'small' })['--editor-para-gap']).toBe('0.4em')
    expect(editorStyleVars({ paraSpacing: 'medium' })['--editor-para-gap']).toBe('0.8em')
    expect(editorStyleVars({ paraSpacing: 'large' })['--editor-para-gap']).toBe('1.4em')
    expect(editorStyleVars({ paraSpacing: 'xxx' })['--editor-para-gap']).toBe('0em')
  })
  it('תוויות הריווח מכסות בדיוק את ערכי ההעדפות', () => {
    expect(LINE_HEIGHT_OPTIONS.map((o) => o.value)).toEqual(LINE_HEIGHTS)
    expect(PARA_SPACING_OPTIONS.map((o) => o.value)).toEqual(PARA_SPACINGS)
    expect(Object.keys(LINE_HEIGHT)).toEqual(LINE_HEIGHTS)
    expect(Object.keys(PARA_GAP_EM)).toEqual(PARA_SPACINGS)
  })
})

describe('זום', () => {
  it('clampZoom', () => {
    expect(clampZoom(10)).toBe(25)
    expect(clampZoom(500)).toBe(300)
    expect(clampZoom(99.6)).toBe(100)
  })
  it('התאמה לרוחב', () => {
    expect(fitZoomPercent({ containerWidth: 840, imageWidth: 1000, padding: 40 })).toBe(80)
  })
  it('תמונה שלא נטענה — null', () => {
    expect(fitZoomPercent({ containerWidth: 500, imageWidth: 0 })).toBeNull()
    expect(fitZoomPercent({ containerWidth: 10, imageWidth: 100, padding: 20 })).toBeNull()
  })
})

describe('caretLineJump', () => {
  const text = 'אבגדה\nוז\nחטיכל'
  it('לשורה הבאה באותה עמודה', () => {
    expect(caretLineJump(text, 1, 1)).toBe(7) // עמודה 1 בשורה 2
  })
  it('שורה קצרה — לסוף השורה', () => {
    expect(caretLineJump(text, 4, 1)).toBe(8)
  })
  it('לשורה הקודמת', () => {
    expect(caretLineJump(text, 10, -1)).toBe(7)
    expect(caretLineJump(text, 7, -1)).toBe(1)
  })
  it('בקצוות — לא זז', () => {
    expect(caretLineJump(text, 2, -1)).toBe(2)
    expect(caretLineJump(text, 12, 1)).toBe(12)
    expect(caretLineJump('', 0, 1)).toBe(0)
  })
})

describe('nudgePanelSize', () => {
  it('זה לצד זה: חץ שמאלה מגדיל את הצילום (בימין)', () => {
    expect(nudgePanelSize(50, 'ArrowLeft')).toBe(52)
    expect(nudgePanelSize(50, 'ArrowRight')).toBe(48)
  })
  it('בהחלפת צדדים — להפך', () => {
    expect(nudgePanelSize(50, 'ArrowLeft', { swap: true })).toBe(48)
  })
  it('אחד מעל השני: חץ למטה מגדיל', () => {
    expect(nudgePanelSize(50, 'ArrowDown', { orientation: 'horizontal' })).toBe(52)
    expect(nudgePanelSize(50, 'ArrowLeft', { orientation: 'horizontal' })).toBeNull()
  })
  it('גבולות ו-Home/End', () => {
    expect(nudgePanelSize(PANEL_SIZE.max, 'ArrowLeft')).toBe(PANEL_SIZE.max)
    expect(nudgePanelSize(40, 'Home')).toBe(PANEL_SIZE.min)
    expect(nudgePanelSize(40, 'End')).toBe(PANEL_SIZE.max)
    expect(nudgePanelSize(40, 'a')).toBeNull()
  })
})

describe('shortcutKeys', () => {
  it('צירוף שמור → מקשים', () => {
    expect(shortcutKeys('Ctrl+KeyH')).toEqual(['Ctrl', 'H'])
    expect(shortcutKeys('Ctrl+Shift+KeyI')).toEqual(['Ctrl', 'Shift', 'I'])
    expect(shortcutKeys('F11')).toEqual(['F11'])
    expect(shortcutKeys(undefined)).toBeUndefined()
  })
})

describe('ספירות', () => {
  it('מילים', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('א ב  ג\nד')).toBe(4)
    expect(countWords('<b>מילה</b> שנייה')).toBe(2)
  })
  it('שורות', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('א\nב\n\n')).toBe(2)
    expect(countLines('א\n\nב')).toBe(3)
  })
  it('מיקום הסמן', () => {
    const text = 'אחת שתיים\nשלוש ארבע חמש'
    expect(caretPosition(text, 0)).toEqual({ line: 1, totalLines: 2, word: 1, pageWord: 1, totalWords: 5 })
    expect(caretPosition(text, 5)).toEqual({ line: 1, totalLines: 2, word: 2, pageWord: 2, totalWords: 5 })
    expect(caretPosition(text, text.length)).toEqual({ line: 2, totalLines: 2, word: 3, pageWord: 5, totalWords: 5 })
  })
  it('מיקום הסמן — מספר המילה בכל הדף, בלי לספור תגים', () => {
    const text = '<b>אחת</b> שתיים\nשלוש <i>ארבע</i>'
    expect(caretPosition(text, text.indexOf('שלוש'))).toMatchObject({ line: 2, word: 1, pageWord: 3, totalWords: 4 })
    expect(caretPosition(text, text.indexOf('ארבע'))).toMatchObject({ line: 2, pageWord: 4, totalWords: 4 })
    expect(caretPosition('', 0)).toMatchObject({ pageWord: 1, totalWords: 0 })
    // תג עיצוב בתוך מילה לא מפצל אותה; תג מבנה (h2/br) כן מפריד
    expect(countWords('ו<big>גדול</big> ו<small>קטן</small>.')).toBe(2)
    expect(countWords('<h2>כותרת</h2>טקסט<br>עוד')).toBe(3)
  })
})

describe('toAriaKeys', () => {
  it('מקשי תצוגה → ערך aria-keyshortcuts', () => {
    expect(toAriaKeys(['Ctrl', 'K'])).toBe('Control+K')
    expect(toAriaKeys(['Ctrl', 'Shift', 'I'])).toBe('Control+Shift+I')
    expect(toAriaKeys(['Cmd', 'Enter'])).toBe('Meta+Enter')
    expect(toAriaKeys(['Ctrl', '='])).toBe('Control+=')
  })
  it('בלי מקשים — undefined', () => {
    expect(toAriaKeys(undefined)).toBeUndefined()
    expect(toAriaKeys([])).toBeUndefined()
  })
})

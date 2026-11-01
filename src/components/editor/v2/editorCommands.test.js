import { describe, it, expect, vi } from 'vitest'
import { buildEditorCommands, COMMAND_GROUPS } from './editorCommands'
import { DEFAULT_SHORTCUTS } from '@/app/library/books/[path]/[pageNumber]/keyboardShortcutMatching'
import { hasIconGlyph } from '@/components/ui/iconGlyphs'

const byId = (commands, id) => commands.find((c) => c.id === id)

describe('buildEditorCommands', () => {
  it('כל הפעולות הנדירות של הסרגל הישן נמצאות בחלון', () => {
    const ids = buildEditorCommands({ state: { canClaim: true } }).map((c) => c.id)
    for (const id of [
      'findReplace', 'spellcheck', 'split', 'imageToText', 'removeDigits', 'runSavedSearches',
      'detectWords', 'downloadImage', 'layout', 'togglePanel', 'fullScreen', 'toggleFontSerif', 'fontAssistant', 'fontFrank', 'fontNoto', 'fontSans', 'fontIbmPlex', 'fontGoogleSans', 'fontOpenSans',
      'shortcuts', 'guidelines', 'claim', 'finish', 'save'
    ]) {
      expect(ids).toContain(id)
    }
    expect(new Set(ids).size).toBe(ids.length)
    // זיהוי הטקסט (OCR) הוסר מהעורך
    expect(ids.filter((id) => /ocr|gemini|selectionMode/i.test(id))).toEqual([])
  })

  it('ארבע קבוצות, וכל אייקון קיים בגופן', () => {
    const commands = buildEditorCommands({ state: { canClaim: true, canRelease: true } })
    expect(new Set(commands.map((c) => c.group))).toEqual(new Set(Object.values(COMMAND_GROUPS)))
    for (const c of commands) expect(hasIconGlyph(c.icon), c.id).toBe(true)
  })

  it('הקיצור מגיע ממפת הקיצורים של המשתמש', () => {
    const commands = buildEditorCommands({ shortcuts: { ...DEFAULT_SHORTCUTS, findReplace: 'Ctrl+KeyH' } })
    expect(byId(commands, 'findReplace').shortcut).toEqual(['Ctrl', 'H'])
    expect(byId(commands, 'bold').shortcut).toEqual(['Ctrl', 'B'])
    expect(byId(commands, 'spellcheck').shortcut).toBeUndefined()
  })

  it('run מפעיל את המטפל עם הארגומנטים', () => {
    const insertTag = vi.fn()
    const align = vi.fn()
    const commands = buildEditorCommands({ run: { insertTag, align } })
    byId(commands, 'h2').run()
    byId(commands, 'alignCenter').run()
    expect(insertTag).toHaveBeenCalledWith('h2')
    expect(align).toHaveBeenCalledWith('center')
    // מטפל חסר — לא זורק
    expect(() => byId(commands, 'save').run()).not.toThrow()
  })

  it('החלפת גופן עם תגים / בלי תגים — התווית לפי הגופן הנוכחי, והגופן הנבחר מסומן', () => {
    const toggleFontSerif = vi.fn()
    const serif = buildEditorCommands({ state: { fontFamily: 'frank' }, run: { toggleFontSerif } })
    expect(byId(serif, 'toggleFontSerif').label).toBe('החלף גופן: בלי תגים')
    byId(serif, 'toggleFontSerif').run()
    expect(toggleFontSerif).toHaveBeenCalledTimes(1)
    expect(byId(serif, 'fontFrank').label).toContain('נבחר')
    const sans = buildEditorCommands({ state: { fontFamily: 'sans' } })
    expect(byId(sans, 'toggleFontSerif').label).toBe('החלף גופן: עם תגים')
    expect(byId(sans, 'fontSans').label).toContain('Sans Serif (בלי תגים) — נבחר')
    expect(byId(sans, 'fontFrank').label).not.toContain('נבחר')
  })

  it('ריווח שורות ורווח בין פסקאות — פקודה לכל דרגה, הנוכחית מסומנת', () => {
    const setLineHeight = vi.fn()
    const setParaSpacing = vi.fn()
    const commands = buildEditorCommands({ state: { lineHeight: 'normal', paraSpacing: 'none' }, run: { setLineHeight, setParaSpacing } })
    expect(commands.filter((c) => c.id.startsWith('lineHeight')).map((c) => c.label)).toEqual([
      'ריווח שורות: צפוף', 'ריווח שורות: רגיל — נבחר', 'ריווח שורות: מרווח', 'ריווח שורות: מרווח מאוד'
    ])
    byId(commands, 'lineHeightLoose').run()
    expect(setLineHeight).toHaveBeenCalledWith('loose')
    expect(byId(commands, 'paraSpacingNone').label).toBe('רווח בין פסקאות: בלי — נבחר')
    byId(commands, 'paraSpacingLarge').run()
    expect(setParaSpacing).toHaveBeenCalledWith('large')
    // בתצוגת קוד אין רווח בין פסקאות — גם לא בחלון הפקודות
    const code = buildEditorCommands({ state: { textView: 'code' } })
    expect(code.some((c) => c.id.startsWith('paraSpacing'))).toBe(false)
    expect(code.filter((c) => c.id.startsWith('lineHeight'))).toHaveLength(4)
  })

  it('מצבים: מושבת ותוויות', () => {
    const commands = buildEditorCommands({
      state: { hasImage: false, twoColumns: true }
    })
    expect(byId(commands, 'downloadImage').disabled).toBe(true)
    expect(byId(commands, 'split').label).toBe('איחוד לטור אחד')
    // אין מעבר לעמוד קודם/הבא מתוך העורך
    expect(byId(commands, 'prevPage')).toBeUndefined()
    expect(byId(commands, 'nextPage')).toBeUndefined()
    expect(byId(commands, 'claim')).toBeUndefined()
  })

  it('ביטול/ביצוע מחדש: מושבתים כשאין מה לבטל/לבצע, ופעילים כשהמצב לא ידוע', () => {
    const none = buildEditorCommands({ state: { canUndo: false, canRedo: false } })
    expect(byId(none, 'undo').disabled).toBe(true)
    expect(byId(none, 'redo').disabled).toBe(true)
    const some = buildEditorCommands({ state: { canUndo: true, canRedo: false } })
    expect(byId(some, 'undo').disabled).toBe(false)
    expect(byId(some, 'redo').disabled).toBe(true)
    expect(byId(buildEditorCommands(), 'undo').disabled).toBe(false)
  })

  it('זהה מילים בעמוד: מושבת בזמן ריצה או בלי צילום, ומפעיל את detectWords', () => {
    const detectWords = vi.fn()
    const ready = buildEditorCommands({ state: { hasImage: true, canDetectWords: true }, run: { detectWords } })
    expect(byId(ready, 'detectWords').label).toBe('זהה מילים בעמוד')
    expect(byId(ready, 'detectWords').disabled).toBe(false)
    byId(ready, 'detectWords').run()
    expect(detectWords).toHaveBeenCalledTimes(1)
    const busy = buildEditorCommands({ state: { hasImage: true, wordDetecting: true } })
    expect(byId(busy, 'detectWords').disabled).toBe(true)
    expect(byId(buildEditorCommands({ state: { hasImage: false } }), 'detectWords').disabled).toBe(true)
  })
})

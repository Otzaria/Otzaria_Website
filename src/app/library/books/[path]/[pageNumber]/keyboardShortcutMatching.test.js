import { describe, it, expect } from 'vitest'
import {
  buildShortcutCombination,
  findMatchingActionId,
  DEFAULT_SHORTCUTS,
  SHORTCUTS_VERSION,
  migrateUserShortcuts,
  findShortcutConflict,
  findDuplicateShortcuts,
} from './keyboardShortcutMatching'
import { isReservedShortcut } from '@/lib/shortcuts'

describe('buildShortcutCombination', () => {
  it('בונה קומבינציה עם מקש בקרה בלבד', () => {
    expect(buildShortcutCombination({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, code: 'KeyS' })).toBe('Ctrl+KeyS')
  })

  it('בונה קומבינציה עם כמה מקשים, לפי סדר קבוע Ctrl->Alt->Shift->Meta', () => {
    expect(buildShortcutCombination({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: false, code: 'KeyI' })).toBe('Ctrl+Alt+Shift+KeyI')
  })

  it('בונה קומבינציה ללא שום מקש-עזר', () => {
    expect(buildShortcutCombination({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code: 'F11' })).toBe('F11')
  })

  // טסט רגרסיה: סדר המקשים חייב להישאר Ctrl, Alt, Shift, Meta
  it('רגרסיה: סדר קבוע גם כשכל המקשים לחוצים', () => {
    expect(buildShortcutCombination({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: true, code: 'KeyX' })).toBe('Ctrl+Alt+Shift+Meta+KeyX')
  })
})

describe('findMatchingActionId', () => {
  const shortcuts = { save: 'Ctrl+KeyS', bold: 'Ctrl+KeyB' }

  it('מוצא את מזהה הפעולה התואם', () => {
    expect(findMatchingActionId(shortcuts, 'Ctrl+KeyS')).toBe('save')
  })

  it('מחזיר null כשאין התאמה', () => {
    expect(findMatchingActionId(shortcuts, 'Ctrl+KeyZ')).toBeNull()
  })
})

describe('DEFAULT_SHORTCUTS', () => {
  it('Ctrl+S שומר ו-Ctrl+Enter מסיים', () => {
    expect(findMatchingActionId(DEFAULT_SHORTCUTS, 'Ctrl+KeyS')).toBe('save')
    expect(findMatchingActionId(DEFAULT_SHORTCUTS, 'Ctrl+Enter')).toBe('finish')
  })

  it('יש קיצור ברירת מחדל ל-layout', () => {
    expect(DEFAULT_SHORTCUTS.layout).toBe('Alt+KeyL')
  })

  it('אין שני קיצורים זהים', () => {
    const combos = Object.values(DEFAULT_SHORTCUTS)
    expect(new Set(combos).size).toBe(combos.length)
  })
})

describe('migrateUserShortcuts', () => {
  it('בלי מפה שמורה — ברירת המחדל', () => {
    expect(migrateUserShortcuts(null, null)).toEqual({ shortcuts: { ...DEFAULT_SHORTCUTS }, changed: false, unbound: [] })
  })

  it('ערך פגום — ברירת המחדל, ומסומן לשמירה מחדש', () => {
    expect(migrateUserShortcuts([1, 2], null)).toEqual({ shortcuts: { ...DEFAULT_SHORTCUTS }, changed: true, unbound: [] })
  })

  it('מגרסה ישנה: מוסיף את layout ושומר את הקיצורים המותאמים', () => {
    const stored = { save: 'Ctrl+KeyS', finish: 'Alt+KeyF', bold: 'Ctrl+KeyB' }
    const { shortcuts, changed } = migrateUserShortcuts(stored, null)
    expect(shortcuts).toEqual({ save: 'Ctrl+KeyS', finish: 'Alt+KeyF', bold: 'Ctrl+KeyB', layout: 'Alt+KeyL', commandPalette: 'Ctrl+KeyK', toggleTextView: 'Alt+Shift+KeyM', clearFormatting: 'Ctrl+Backslash' })
    expect(changed).toBe(true)
  })

  it('מגרסה 2: מוסיף רק את חלון הפקודות (Ctrl+K)', () => {
    const { shortcuts, changed } = migrateUserShortcuts({ save: 'Ctrl+KeyS' }, 2)
    expect(shortcuts).toEqual({ save: 'Ctrl+KeyS', commandPalette: 'Ctrl+KeyK', toggleTextView: 'Alt+Shift+KeyM', clearFormatting: 'Ctrl+Backslash' })
    expect(changed).toBe(true)
  })

  it('לא מוסיף את חלון הפקודות אם Ctrl+K תפוס אצל המשתמש', () => {
    const { shortcuts } = migrateUserShortcuts({ bold: 'Ctrl+KeyK' }, 2)
    expect(shortcuts).toEqual({ bold: 'Ctrl+KeyK', toggleTextView: 'Alt+Shift+KeyM', clearFormatting: 'Ctrl+Backslash' })
  })

  it('לא מוסיף את layout אם הצירוף תפוס אצל המשתמש בפעולה אחרת', () => {
    const { shortcuts } = migrateUserShortcuts({ split: 'Alt+KeyL' }, 1)
    expect(shortcuts).toEqual({ split: 'Alt+KeyL', commandPalette: 'Ctrl+KeyK', toggleTextView: 'Alt+Shift+KeyM', clearFormatting: 'Ctrl+Backslash' })
  })

  it('לא דורס קיצור layout שהמשתמש כבר הגדיר', () => {
    const { shortcuts } = migrateUserShortcuts({ layout: 'Alt+KeyY' }, 1)
    expect(shortcuts.layout).toBe('Alt+KeyY')
  })

  it('בגרסה הנוכחית לא מוסיף שוב פעולה שהמשתמש מחק', () => {
    const stored = { save: 'Ctrl+KeyS' }
    expect(migrateUserShortcuts(stored, SHORTCUTS_VERSION)).toEqual({ shortcuts: stored, changed: false, unbound: [] })
  })

  it('מגרסה 3: מוחק את הקיצורים של זיהוי הטקסט שהוסר (ocr, selectionMode, settings)', () => {
    const stored = { save: 'Ctrl+KeyS', ocr: 'Alt+KeyO', selectionMode: 'Alt+KeyV', settings: 'Alt+KeyG', commandPalette: 'Ctrl+KeyK' }
    const { shortcuts, changed } = migrateUserShortcuts(stored, 3)
    expect(shortcuts).toEqual({ save: 'Ctrl+KeyS', commandPalette: 'Ctrl+KeyK', toggleTextView: 'Alt+Shift+KeyM', clearFormatting: 'Ctrl+Backslash' })
    expect(changed).toBe(true)
  })

  it('מגרסה 7: מוחק את קיצורי סיבוב הצילום ומשאיר את השאר', () => {
    const stored = { save: 'Ctrl+KeyS', rotateR: 'Alt+KeyR', rotateL: 'Alt+KeyE', layout: 'Alt+KeyL' }
    const { shortcuts, changed } = migrateUserShortcuts(stored, 7)
    expect(shortcuts).toEqual({ save: 'Ctrl+KeyS', layout: 'Alt+KeyL' })
    expect(changed).toBe(true)
  })

  it('אין בברירת המחדל קיצור לסיבוב הצילום', () => {
    expect(DEFAULT_SHORTCUTS).not.toHaveProperty('rotateR')
    expect(Object.values(DEFAULT_SHORTCUTS)).not.toContain('Alt+KeyR')
  })

  it('מגרסה 5: מוסיף את "נקה עיצוב" (Ctrl+\\), אלא אם הצירוף תפוס', () => {
    expect(migrateUserShortcuts({ save: 'Ctrl+KeyS' }, 5).shortcuts).toEqual({ save: 'Ctrl+KeyS', clearFormatting: 'Ctrl+Backslash' })
    expect(migrateUserShortcuts({ bold: 'Ctrl+Backslash' }, 5).shortcuts).toEqual({ bold: 'Ctrl+Backslash' })
  })

  it('מגרסה 4: מוסיף את המעבר בין תצוגה מעוצבת לקוד (ברירת המחדל הנוכחית), אלא אם הצירוף תפוס', () => {
    expect(migrateUserShortcuts({ save: 'Ctrl+KeyS' }, 4).shortcuts).toEqual({ save: 'Ctrl+KeyS', toggleTextView: 'Alt+Shift+KeyM', clearFormatting: 'Ctrl+Backslash' })
    expect(migrateUserShortcuts({ bold: 'Alt+Shift+KeyM' }, 4).shortcuts).toEqual({ bold: 'Alt+Shift+KeyM', clearFormatting: 'Ctrl+Backslash' })
  })

  it('סדר ההעברה: קודם כל ההסרות, ואז ההוספות — Ctrl+K שהתפנה מ-ocr מגיע לחלון הפקודות (QA P2-6)', () => {
    const { shortcuts } = migrateUserShortcuts({ save: 'Ctrl+KeyS', ocr: 'Ctrl+KeyK' }, 2)
    expect(shortcuts.commandPalette).toBe('Ctrl+KeyK')
    expect(shortcuts).not.toHaveProperty('ocr')
  })

  it('מגרסה 6: ברירות מחדל שמתנגשות בדפדפן מוחלפות — רק אם המשתמש לא שינה אותן והחדשות פנויות', () => {
    const old = { save: 'Ctrl+KeyS', imageToText: 'Ctrl+Shift+KeyI', toggleTextView: 'Ctrl+Shift+KeyM' }
    expect(migrateUserShortcuts(old, 6)).toEqual({
      shortcuts: { save: 'Ctrl+KeyS', imageToText: 'Alt+KeyI', toggleTextView: 'Alt+Shift+KeyM' },
      changed: true,
      unbound: [],
    })
    // קיצור שהמשתמש בחר בעצמו — נשאר
    expect(migrateUserShortcuts({ imageToText: 'Alt+KeyQ' }, 6).shortcuts).toEqual({ imageToText: 'Alt+KeyQ' })
    // הצירוף החדש תפוס אצל המשתמש — הישן (קיצור של כלי המפתחים) מוסר בלי תחליף, ומדווח
    expect(migrateUserShortcuts({ imageToText: 'Ctrl+Shift+KeyI', bold: 'Alt+KeyI' }, 6)).toEqual({
      shortcuts: { bold: 'Alt+KeyI' },
      changed: true,
      unbound: [{ actionId: 'imageToText', from: 'Ctrl+Shift+KeyI', to: 'Alt+KeyI', conflictWith: 'bold' }],
    })
  })

  it('ברירות המחדל לא משתמשות בצירופים שהדפדפן תופס (כלי מפתחים/פרופיל)', () => {
    const combos = Object.values(DEFAULT_SHORTCUTS)
    expect(combos).not.toContain('Ctrl+Shift+KeyI')
    expect(combos).not.toContain('Ctrl+Shift+KeyM')
    expect(combos).not.toContain('Ctrl+Shift+KeyJ')
  })

  it('אין בברירת המחדל קיצורים לזיהוי הטקסט', () => {
    expect(DEFAULT_SHORTCUTS).not.toHaveProperty('ocr')
    expect(DEFAULT_SHORTCUTS).not.toHaveProperty('selectionMode')
  })

  it('מסנן ערכים שאינם מחרוזת', () => {
    const { shortcuts, changed } = migrateUserShortcuts({ save: 'Ctrl+KeyS', bold: null }, SHORTCUTS_VERSION)
    expect(shortcuts).toEqual({ save: 'Ctrl+KeyS' })
    expect(changed).toBe(true)
  })
})

describe('findShortcutConflict / findDuplicateShortcuts', () => {
  it('מוצא פעולה אחרת עם אותו צירוף, לא את הפעולה עצמה', () => {
    const map = { save: 'Ctrl+KeyS', bold: 'Ctrl+KeyB' }
    expect(findShortcutConflict(map, 'italic', 'Ctrl+KeyB')).toBe('bold')
    expect(findShortcutConflict(map, 'bold', 'Ctrl+KeyB')).toBe(null)
    expect(findShortcutConflict(map, 'italic', 'Ctrl+KeyI')).toBe(null)
  })
  it('מחזיר את הצירופים הכפולים', () => {
    expect(findDuplicateShortcuts({ a: 'Ctrl+KeyS', b: 'Ctrl+KeyS', c: 'Alt+KeyX' })).toEqual([{ combo: 'Ctrl+KeyS', actionIds: ['a', 'b'] }])
    expect(findDuplicateShortcuts(DEFAULT_SHORTCUTS)).toEqual([])
  })
})

describe('DEFAULT_SHORTCUTS — אף ברירת מחדל אינה צירוף שמור', () => {
  it('כולן ניתנות להקלטה בחלון הקיצורים (כולל Ctrl+B, Ctrl+Backslash, Ctrl+Enter)', () => {
    for (const [id, combo] of Object.entries(DEFAULT_SHORTCUTS)) expect(isReservedShortcut(combo), id).toBe(false)
  })
})

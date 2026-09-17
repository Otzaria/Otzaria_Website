import { describe, it, expect } from 'vitest'
import { buildShortcutCombination, findMatchingActionId } from './keyboardShortcutMatching'

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
  const shortcuts = { save: 'Ctrl+KeyS', ocr: 'Alt+KeyO' }

  it('מוצא את מזהה הפעולה התואם', () => {
    expect(findMatchingActionId(shortcuts, 'Ctrl+KeyS')).toBe('save')
  })

  it('מחזיר null כשאין התאמה', () => {
    expect(findMatchingActionId(shortcuts, 'Ctrl+KeyZ')).toBeNull()
  })
})

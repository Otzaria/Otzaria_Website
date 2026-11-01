import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fieldHistoryEntry, fieldKey, pushStructuralUndo, resetFieldHistories, runStructural, syncFieldValue } from './fieldHistoryStore'
import { textareaHistoryApi } from './textareaHistory'

beforeEach(() => resetFieldHistories())

describe('fieldHistoryStore', () => {
  it('מפתח לפי השדה הלוגי — כל דבר שאינו טור הוא content', () => {
    expect(fieldKey('right')).toBe('right')
    expect(fieldKey('left')).toBe('left')
    expect(fieldKey(null)).toBe('content')
    expect(fieldKey('content')).toBe('content')
    expect(fieldHistoryEntry(undefined)).toBe(fieldHistoryEntry('content'))
    expect(fieldHistoryEntry('right')).not.toBe(fieldHistoryEntry('left'))
  })

  it('שדה חדש עם אותו ערך (מעבר תצוגה) — המחסנית נשמרת; ערך אחר — מתאפסת', () => {
    const e = fieldHistoryEntry('content')
    syncFieldValue(e, 'אב')
    e.history.record({ value: 'אב', start: 2, end: 2 }, 'other', 0)
    e.value = 'אבג'
    expect(syncFieldValue(e, 'אבג')).toBe(false)
    expect(e.history.canUndo()).toBe(true)
    expect(syncFieldValue(e, 'משהו אחר')).toBe(true)
    expect(e.history.canUndo()).toBe(false)
  })

  it('resetFieldHistories — מאפס במקום (בקר קיים ממשיך להחזיק את אותה רשומה)', () => {
    const e = fieldHistoryEntry('left')
    syncFieldValue(e, 'x')
    e.history.record({ value: 'x', start: 0, end: 0 }, 'other', 0)
    resetFieldHistories()
    expect(fieldHistoryEntry('left')).toBe(e)
    expect(e.value).toBeNull()
    expect(e.history.canUndo()).toBe(false)
  })

  it('צעד מבני (איחוד טורים): השדה עולה עם הערך המאוחד — הביטול הראשון קורא ל-restore', () => {
    const restore = vi.fn()
    pushStructuralUndo('content', 'ימין — שמאל', restore)
    const ta = document.createElement('textarea')
    ta.value = 'ימין — שמאל'
    document.body.appendChild(ta)
    const api = textareaHistoryApi(ta)
    expect(api.canUndo()).toBe(true)
    expect(api.undo()).toBe(true)
    expect(restore).toHaveBeenCalledTimes(1)
    expect(ta.value).toBe('ימין — שמאל')
    expect(api.canUndo()).toBe(false)
    ta.remove()
  })

  it('צעד מבני — ערך אחר מבחוץ לפני הביטול מבטל אותו; צעד רגיל אינו מבני', () => {
    const restore = vi.fn()
    pushStructuralUndo('content', 'א', restore)
    const e = fieldHistoryEntry('content')
    syncFieldValue(e, 'ב')
    expect(e.history.canUndo()).toBe(false)
    expect(runStructural(e, { value: 'x', start: 0, end: 0 })).toBe(false)
    expect(runStructural(e, null)).toBe(false)
    expect(restore).not.toHaveBeenCalled()
  })
})

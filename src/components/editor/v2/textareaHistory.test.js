import { beforeEach, describe, it, expect } from 'vitest'
import { editKind, historyKey, programmaticSnapshot, installTextareaHistory, textareaHistoryApi } from './textareaHistory'
import { resetFieldHistories } from '@/components/editor/v2/fieldHistoryStore'

beforeEach(() => resetFieldHistories())

describe('textareaHistory — editKind', () => {
  it('תו מוקלד בלי בחירה — type (גם רווח, שמצטרף למילה שלפניו)', () => {
    expect(editKind('insertText', 'א', true)).toBe('type')
    expect(editKind('insertText', ' ', true)).toBe('type')
    expect(editKind('insertText', 'א', false)).toBe('other')
    expect(editKind('insertText', 'אבג', true)).toBe('other')
  })
  it('מחיקת תו — del; מחיקת בחירה/מילה — other', () => {
    expect(editKind('deleteContentBackward', null, true)).toBe('del')
    expect(editKind('deleteContentForward', null, true)).toBe('del')
    expect(editKind('deleteContentBackward', null, false)).toBe('other')
    expect(editKind('deleteWordBackward', null, true)).toBe('other')
  })
})

describe('textareaHistory — historyKey', () => {
  const k = (o) => historyKey({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: '', code: '', ...o })
  it('Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z / ⌘Z', () => {
    expect(k({ ctrlKey: true, key: 'z', code: 'KeyZ' })).toBe('undo')
    expect(k({ ctrlKey: true, key: 'ז', code: 'KeyZ' })).toBe('undo')
    expect(k({ metaKey: true, key: 'z' })).toBe('undo')
    expect(k({ ctrlKey: true, key: 'y' })).toBe('redo')
    expect(k({ ctrlKey: true, shiftKey: true, key: 'Z' })).toBe('redo')
  })
  it('בלי Ctrl, או עם Alt — לא', () => {
    expect(k({ key: 'z' })).toBeNull()
    expect(k({ ctrlKey: true, altKey: true, key: 'z' })).toBeNull()
    expect(k({ ctrlKey: true, key: 'b' })).toBeNull()
  })
})

describe('textareaHistory — עריכה תוכנתית (input בלי beforeinput)', () => {
  it('programmaticSnapshot — הערך הקודם והטווח שהוחלף בו', () => {
    expect(programmaticSnapshot('א ב ג', 'א <b>ב</b> ג')).toEqual({ value: 'א ב ג', start: 2, end: 3 })
    expect(programmaticSnapshot('אב', 'אב')).toBeNull()
  })

  const setup = (value) => {
    const box = document.createElement('div')
    const ta = document.createElement('textarea')
    ta.value = value
    box.appendChild(ta)
    document.body.appendChild(box)
    const off = installTextareaHistory(document, () => box)
    ta.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const type = (data) => {
      ta.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data }))
      const p = ta.selectionStart
      ta.value = ta.value.slice(0, p) + data + ta.value.slice(ta.selectionEnd)
      ta.setSelectionRange(p + data.length, p + data.length)
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data }))
    }
    const programmatic = (next) => {
      ta.value = next
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    }
    const cleanup = () => { off(); box.remove() }
    return { ta, type, programmatic, cleanup, api: textareaHistoryApi(ta) }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0))

  it('פעולה תוכנתית מיד אחרי פתיחה — מתבטלת בצעד אחד', () => {
    const { ta, programmatic, cleanup, api } = setup('שלום עולם')
    programmatic('<b>שלום</b> עולם')
    expect(api.canUndo()).toBe(true)
    api.undo()
    expect(ta.value).toBe('שלום עולם')
    expect(api.canUndo()).toBe(false)
    cleanup()
  })

  it('הקלדה ואחריה פעולה תוכנתית — ביטול ראשון מבטל רק את הפעולה, השני את ההקלדה', async () => {
    const { ta, type, programmatic, cleanup, api } = setup('אב')
    ta.setSelectionRange(2, 2)
    type('ג')
    await tick()
    programmatic('<b>אבג</b>')
    api.undo()
    expect(ta.value).toBe('אבג')
    api.undo()
    expect(ta.value).toBe('אב')
    cleanup()
  })

  it('אות בודדת שהוכנסה תוכנתית — לא מתאחדת עם המילה שלפניה', async () => {
    const { ta, type, programmatic, cleanup, api } = setup('')
    type('א'); await tick()
    type('ב'); await tick()
    programmatic('אבX')
    api.undo()
    expect(ta.value).toBe('אב')
    cleanup()
  })
})

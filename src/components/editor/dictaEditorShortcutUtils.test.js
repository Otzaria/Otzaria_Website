import { describe, it, expect } from 'vitest'
import { buildShortcutCombination, findShortcutActionId } from './dictaEditorShortcutUtils'

describe('buildShortcutCombination', () => {
  it('returns null for a falsy event', () => {
    expect(buildShortcutCombination(null)).toBeNull()
    expect(buildShortcutCombination(undefined)).toBeNull()
  })

  it('returns null when the key itself is a bare modifier', () => {
    expect(buildShortcutCombination({ key: 'Control', code: 'ControlLeft', ctrlKey: true })).toBeNull()
    expect(buildShortcutCombination({ key: 'Alt', code: 'AltLeft', altKey: true })).toBeNull()
    expect(buildShortcutCombination({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })).toBeNull()
    expect(buildShortcutCombination({ key: 'Meta', code: 'MetaLeft', metaKey: true })).toBeNull()
  })

  it('builds a combination string with no modifiers', () => {
    expect(buildShortcutCombination({ key: 'k', code: 'KeyK' })).toBe('KeyK')
  })

  it('orders modifiers as Ctrl, Alt, Shift, Meta regardless of which are present', () => {
    expect(buildShortcutCombination({
      key: 's', code: 'KeyS', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false
    })).toBe('Ctrl+KeyS')

    expect(buildShortcutCombination({
      key: 'c', code: 'KeyC', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false
    })).toBe('Ctrl+Shift+KeyC')

    expect(buildShortcutCombination({
      key: 'x', code: 'KeyX', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true
    })).toBe('Ctrl+Alt+Shift+Meta+KeyX')
  })

  it('matches the DEFAULT_SHORTCUTS combination format used in DictaEditorCore', () => {
    // e.g. 'alignCenter': 'Ctrl+Shift+KeyC'
    expect(buildShortcutCombination({
      key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false
    })).toBe('Ctrl+Shift+KeyC')
    // e.g. 'shortcuts': 'Alt+KeyK'
    expect(buildShortcutCombination({
      key: 'k', code: 'KeyK', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false
    })).toBe('Alt+KeyK')
  })
})

describe('findShortcutActionId', () => {
  const shortcuts = {
    save: 'Ctrl+KeyS',
    bold: 'Ctrl+KeyB',
    shortcuts: 'Alt+KeyK'
  }

  it('returns undefined for falsy combination or shortcuts map', () => {
    expect(findShortcutActionId(null, shortcuts)).toBeUndefined()
    expect(findShortcutActionId('Ctrl+KeyS', null)).toBeUndefined()
  })

  it('finds the action id matching a combination', () => {
    expect(findShortcutActionId('Ctrl+KeyS', shortcuts)).toBe('save')
    expect(findShortcutActionId('Alt+KeyK', shortcuts)).toBe('shortcuts')
  })

  it('returns undefined when no shortcut matches', () => {
    expect(findShortcutActionId('Ctrl+KeyZ', shortcuts)).toBeUndefined()
  })
})

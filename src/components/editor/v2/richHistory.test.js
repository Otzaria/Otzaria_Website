import { describe, expect, it } from 'vitest'
import { createRichHistory } from './richHistory'

const snap = (value, start = value.length, end = start) => ({ value, start, end })

describe('createRichHistory', () => {
  it('coalesces fast typing into one step', () => {
    const h = createRichHistory()
    h.record(snap(''), 'type', 0)
    h.record(snap('a'), 'type', 100)
    h.record(snap('ab'), 'type', 200)
    expect(h.undo(snap('abc'))).toEqual(snap(''))
    expect(h.canUndo()).toBe(false)
    expect(h.redo(snap(''))).toEqual(snap('abc'))
  })

  it('a pause, another kind or breakGroup starts a new step', () => {
    const h = createRichHistory({ coalesceMs: 1000 })
    h.record(snap(''), 'type', 0)
    h.record(snap('a'), 'type', 5000)
    h.record(snap('ab'), 'del', 5100)
    h.breakGroup()
    h.record(snap('a'), 'del', 5200)
    expect(h.undo(snap(''))).toEqual(snap('a'))
    expect(h.undo(snap('a'))).toEqual(snap('ab'))
    expect(h.undo(snap('ab'))).toEqual(snap('a'))
    expect(h.undo(snap('a'))).toEqual(snap(''))
    expect(h.undo(snap(''))).toBeNull()
  })

  it('a new edit clears redo; other edits never merge', () => {
    const h = createRichHistory()
    h.record(snap(''), 'other', 0)
    h.record(snap('x'), 'other', 1)
    h.undo(snap('xy'))
    expect(h.canRedo()).toBe(true)
    h.record(snap('x'), 'type', 2)
    expect(h.canRedo()).toBe(false)
  })

  it('respects the limit', () => {
    const h = createRichHistory({ limit: 2 })
    for (let i = 0; i < 5; i++) h.record(snap(String(i)), 'other', i)
    expect(h.undo(snap('5'))).toEqual(snap('4'))
    expect(h.undo(snap('4'))).toEqual(snap('3'))
    expect(h.undo(snap('3'))).toBeNull()
  })
})

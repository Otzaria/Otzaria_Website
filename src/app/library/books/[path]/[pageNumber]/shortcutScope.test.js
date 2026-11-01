// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { shortcutAllowed, shortcutContext } from './shortcutScope'

afterEach(() => { document.body.innerHTML = '' })

const ctx = (o) => ({ inEditorField: false, inOtherField: false, inDialog: false, ...o })

describe('shortcutAllowed', () => {
  it('עיצוב — רק בשדה העורך', () => {
    expect(shortcutAllowed('bold', ctx({ inEditorField: true }))).toBe(true)
    expect(shortcutAllowed('bold', ctx({ inOtherField: true }))).toBe(false)
    expect(shortcutAllowed('bold', ctx({}))).toBe(false)
    expect(shortcutAllowed('smaller', ctx({ inDialog: true, inOtherField: true }))).toBe(false)
  })
  it('שמירה — מהעורך ומהעמוד, לא מחלון ולא משדה אחר', () => {
    expect(shortcutAllowed('save', ctx({ inEditorField: true }))).toBe(true)
    expect(shortcutAllowed('save', ctx({}))).toBe(true)
    expect(shortcutAllowed('save', ctx({ inDialog: true }))).toBe(false)
    expect(shortcutAllowed('save', ctx({ inOtherField: true }))).toBe(false)
  })
  it('חלון הפקודות — גם משדה אחר, לא מחלון', () => {
    expect(shortcutAllowed('commandPalette', ctx({ inOtherField: true }))).toBe(true)
    expect(shortcutAllowed('commandPalette', ctx({ inDialog: true }))).toBe(false)
  })
})

describe('shortcutContext', () => {
  it('textarea / שדה מעוצב בתוך העורך', () => {
    document.body.innerHTML = '<div class="editor-container"><textarea id="t"></textarea><div data-rich-textarea id="r"><span id="s"></span></div></div>'
    expect(shortcutContext(document.getElementById('t'))).toEqual(ctx({ inEditorField: true }))
    expect(shortcutContext(document.getElementById('s'))).toEqual(ctx({ inEditorField: true }))
  })
  it('שדה חיפוש (input), textarea מחוץ לעורך, כפתור, חלון', () => {
    document.body.innerHTML = '<input id="i"><textarea id="t"></textarea><input type="checkbox" id="c"><button id="b"></button><div role="dialog"><button id="d"></button></div>'
    expect(shortcutContext(document.getElementById('i')).inOtherField).toBe(true)
    expect(shortcutContext(document.getElementById('t'))).toEqual(ctx({ inOtherField: true }))
    expect(shortcutContext(document.getElementById('c')).inOtherField).toBe(false)
    expect(shortcutContext(document.getElementById('b'))).toEqual(ctx({}))
    expect(shortcutContext(document.getElementById('d'))).toEqual(ctx({ inDialog: true }))
    expect(shortcutContext(document.body)).toEqual(ctx({}))
    expect(shortcutContext(null)).toEqual(ctx({}))
  })
})

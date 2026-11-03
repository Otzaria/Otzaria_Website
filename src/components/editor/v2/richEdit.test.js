import { describe, expect, it } from 'vitest'
import { cleanupEmptyPairs, deleteAt, insertLineBreak, replaceSelection } from './richEdit'

describe('replaceSelection', () => {
  it('inserts plain text at the raw offset', () => {
    expect(replaceSelection('abc<b>def</b>', 6, 6, 'x')).toEqual({ value: 'abc<b>xdef</b>', caret: 7 })
    expect(replaceSelection('abc<b>def</b>', 3, 3, 'x')).toEqual({ value: 'abcx<b>def</b>', caret: 4 })
  })

  it('snaps offsets inside a tag', () => {
    expect(replaceSelection('a<b>c</b>', 2, 2, 'x').value).toBe('ax<b>c</b>')
  })

  it('replacing all of a bold run keeps the bold', () => {
    expect(replaceSelection('abc<b>def</b>ghi', 6, 9, 'x')).toEqual({ value: 'abc<b>x</b>ghi', caret: 7 })
  })

  it('a wide selection keeps tags and drops the emptied pair', () => {
    expect(replaceSelection('abc<b>def</b>ghi', 2, 14, '')).toEqual({ value: 'abhi', caret: 2 })
    expect(replaceSelection('a<h2>x<b>y</b></h2>z', 1, 19, 'Q').value).toBe('aQz')
  })

  it('keeps tags that are only partly selected', () => {
    expect(replaceSelection('a<b>bc</b>d', 0, 5, '').value).toBe('<b>c</b>d')
  })

  it('normalizes CRLF in pasted text', () => {
    expect(replaceSelection('', 0, 0, 'a\r\nb\rc').value).toBe('a\nb\nc')
  })

  it('does not touch existing empty pairs on plain insertion', () => {
    expect(replaceSelection('a<b></b>', 1, 1, 'x').value).toBe('ax<b></b>')
  })
})

describe('insertLineBreak', () => {
  it('plain line', () => {
    expect(insertLineBreak('abcd', 2, 2)).toEqual({ value: 'ab\ncd', caret: 3 })
  })

  it('splits tags opened on the line', () => {
    expect(insertLineBreak('<h2>abcd</h2>', 6, 6)).toEqual({ value: '<h2>ab</h2>\n<h2>cd</h2>', caret: 16 })
    expect(insertLineBreak('<h2>a<b>bc</b>d</h2>', 9, 9).value).toBe('<h2>a<b>b</b></h2>\n<h2><b>c</b>d</h2>')
  })

  it('at the end / start of a run leaves no empty pair', () => {
    expect(insertLineBreak('<h2>ab</h2>', 6, 6)).toEqual({ value: '<h2>ab</h2>\n', caret: 12 })
    expect(insertLineBreak('<h2>ab</h2>', 4, 4)).toEqual({ value: '\n<h2>ab</h2>', caret: 5 })
  })

  it('keeps attributes when reopening', () => {
    expect(insertLineBreak('<b x="1">ab</b>', 10, 10).value).toBe('<b x="1">a</b>\n<b x="1">b</b>')
  })

  it('does not split a tag that crosses lines', () => {
    expect(insertLineBreak('<big>ab\ncd</big>', 6, 6).value).toBe('<big>a\nb\ncd</big>')
  })

  it('replaces a selection', () => {
    expect(insertLineBreak('abcd', 1, 3)).toEqual({ value: 'a\nd', caret: 2 })
  })
})

describe('deleteAt', () => {
  it('backspace skips closing tags and keeps them', () => {
    expect(deleteAt('<b>ab</b>c', 9, 9)).toEqual({ value: '<b>a</b>c', caret: 4 })
  })

  it('backspace at start of a bold run deletes the char before the tag', () => {
    expect(deleteAt('x<b>ab</b>', 4, 4)).toEqual({ value: '<b>ab</b>', caret: 0 })
  })

  it('deleting the last char of a run removes the empty pair', () => {
    expect(deleteAt('x<b>a</b>y', 5, 5)).toEqual({ value: 'xy', caret: 1 })
  })

  it('backspace at line start rejoins an Enter split', () => {
    const split = insertLineBreak('<h2>abcd</h2>', 6, 6)
    expect(deleteAt(split.value, split.caret, split.caret)).toEqual({ value: '<h2>abcd</h2>', caret: 6 })
  })

  it('Enter+Backspace מחזיר את המקור בדיוק — גם בין "</b><b>" שהיו כבר בטקסט (QA P2-8)', () => {
    const cases = [
      '<b>a</b><b>b</b>', '<b>ab</b>', '<i><b>a</b><b>b</b></i>', 'x <b>a b</b><b>c d</b><b>e</b>y',
      '<b>a</b><b>b</b>\n<b>c</b>', '<h2>a<b>b</b><b>c</b></h2>', '<b><i>a</i></b><b><i>b</i></b>',
    ]
    for (const s of cases) {
      for (let p = 0; p <= s.length; p++) {
        const r = insertLineBreak(s, p, p)
        expect(deleteAt(r.value, r.caret, r.caret).value, `${s} @${p} → ${r.value}`).toBe(s)
      }
    }
  })

  it('Ctrl+A והקלדה/הדבקה: אלמנט שכולו בבחירה, כשהבחירה חורגת ממנו, לא עוטף את הטקסט החדש (QA P1)', () => {
    const all = '<h2>כותרת</h2>\nאב <b>גד</b>'
    expect(replaceSelection(all, 0, all.length, 'x').value).toBe('x')
    expect(replaceSelection(all, 0, all.length, 'שורה\nשנייה').value).toBe('שורה\nשנייה')
    // הדבקה רב-שורתית מעל כותרת שלמה — לא נשארת כותרת
    expect(replaceSelection('<h2>כותרת</h2>', 4, 9, 'א\nב').value).toBe('א\nב')
    // בחירה של מילה מודגשת בדיוק והקלדה — נשארת מודגשת (כמו קודם)
    expect(replaceSelection('א <b>גד</b> ה', 5, 7, 'ז').value).toBe('א <b>ז</b> ה')
  })

  it('Enter בין "</b><b>" קיימים: זוג ריק אחרי הסמן שומר שהם לא יתאחדו', () => {
    expect(insertLineBreak('<b>a</b><b>b</b>', 8, 8)).toEqual({ value: '<b>a</b>\n<b></b><b>b</b>', caret: 9 })
  })

  it('plain join', () => {
    expect(deleteAt('ab\ncd', 3, 3)).toEqual({ value: 'abcd', caret: 2 })
    expect(deleteAt('ab\ncd', 2, 2, { forward: true })).toEqual({ value: 'abcd', caret: 2 })
  })

  it('niqqud: backspace removes one mark, delete removes the grapheme', () => {
    const s = 'בָּר'
    expect(deleteAt(s, 3, 3).value).toBe('בָר')
    expect(deleteAt(s, 0, 0, { forward: true }).value).toBe('ר')
  })

  it('surrogate pairs are one char', () => {
    expect(deleteAt('a😀', 3, 3).value).toBe('a')
  })

  it('entities are deleted whole', () => {
    expect(deleteAt('a&nbsp;b', 7, 7).value).toBe('ab')
  })

  it('at the very start / end — nothing', () => {
    expect(deleteAt('<b>a</b>', 0, 0)).toEqual({ value: '<b>a</b>', caret: 0 })
    expect(deleteAt('<b>a</b>', 8, 8, { forward: true }).value).toBe('<b>a</b>')
  })

  it('word deletion keeps tags', () => {
    expect(deleteAt('aa <b>bb</b>', 12, 12, { word: true }).value).toBe('aa ')
    expect(deleteAt('aa bb', 5, 5, { word: true }).value).toBe('aa ')
    expect(deleteAt('aa bb', 0, 0, { word: true, forward: true }).value).toBe(' bb')
  })
})

describe('cleanupEmptyPairs', () => {
  it('only near the window', () => {
    expect(cleanupEmptyPairs('<b></b>x<i></i>', 8, 8, 8).value).toBe('<b></b>x')
  })
  it('ignores mismatched names', () => {
    expect(cleanupEmptyPairs('<b></i>', 0, 7, 0).value).toBe('<b></i>')
  })
})

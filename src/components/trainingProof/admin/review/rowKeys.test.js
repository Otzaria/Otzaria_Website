// isTyping — מתי מקשי השורות (1/2/3, Delete, 0-4) לא פועלים: הקלדה בשדה, או מקש בתוך בורר
import { describe, expect, it } from 'vitest'
import { isTyping } from './rowKeys'

const html = (markup) => {
  const root = document.createElement('div')
  root.innerHTML = markup
  return root
}

describe('isTyping', () => {
  it('שדות הקלדה — כן; תיבת סימון וכפתור רגיל — לא', () => {
    const root = html('<input id="t"><input id="c" type="checkbox"><textarea id="a"></textarea><button id="b">x</button>')
    expect(isTyping(root.querySelector('#t'))).toBe(true)
    expect(isTyping(root.querySelector('#a'))).toBe(true)
    expect(isTyping(root.querySelector('#c'))).toBe(false)
    expect(isTyping(root.querySelector('#b'))).toBe(false)
    expect(isTyping(null)).toBe(false)
  })

  it('בורר: הכפתור שלו, הרשימה הפתוחה ואפשרות בתוכה — כן', () => {
    const root = html('<button id="t" aria-haspopup="listbox"><span id="s">סטטוס</span></button><ul id="l" role="listbox"><li id="o" role="option">אושר</li></ul>')
    for (const id of ['#t', '#s', '#l', '#o']) expect(isTyping(root.querySelector(id))).toBe(true)
  })
})

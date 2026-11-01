import { describe, expect, it } from 'vitest'
import { buildRichIndex } from './richMap'
import { displayFromDom, domPointFromRaw, lineElements, rawFromDomPoint, renderInto } from './richDom'
import { clearBookLine, hasBookDecor, layoutBookLine } from './bookLayout'

// הקישוטים של עימוד הספר הם floats ריקים בתחילת השורה: הם לא אמורים לשנות את טקסט התצוגה
// או את המיפוי בין נקודה ב-DOM להיסט במחרוזת (richDom). המדידה עצמה — בדפדפן אמיתי בלבד.

function setup(raw) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const index = buildRichIndex(raw)
  renderInto(host, index, true)
  return { host, index }
}

function addDecor(lineEl) {
  for (const kind of ['sp', 'win']) {
    const d = document.createElement('span')
    d.className = `rt-bk rt-bk-${kind}`
    d.setAttribute('contenteditable', 'false')
    lineEl.prepend(d)
  }
}

describe('bookLayout — קישוטים שקופים למיפוי', () => {
  const raw = '<b>שבועת</b> הדיינין, וביאר\nשורה שנייה'

  it('טקסט התצוגה וההיסטים לא משתנים כשיש קישוטים', () => {
    const { host, index } = setup(raw)
    const before = displayFromDom(host)
    const P = [0, 3, 8, 12, 20, raw.length]
    const round = () => P.map((p) => { const a = domPointFromRaw(host, index, p); return rawFromDomPoint(host, index, a.node, a.offset) })
    const expected = round()
    lineElements(host).forEach(addDecor)
    expect(displayFromDom(host)).toBe(before)
    expect(round()).toEqual(expected)
  })

  it('נקודה בין הקישוטים לטקסט (רמת השורה) = תחילת השורה, אחרי התגים', () => {
    const { host, index } = setup(raw)
    const line = lineElements(host)[0]
    addDecor(line)
    // אחרי שני הקישוטים — כמו היסט 0 בצד "אחרי" (בתוך המודגש)
    expect(rawFromDomPoint(host, index, line, 2)).toBe(3)
    expect(rawFromDomPoint(host, index, line, 0)).toBe(3)
  })

  it('clearBookLine מסיר רק את הקישוטים', () => {
    const { host } = setup(raw)
    const line = lineElements(host)[0]
    const text = line.textContent
    addDecor(line)
    line.setAttribute('data-bk-tail', '')
    expect(hasBookDecor(line)).toBe(true)
    clearBookLine(line)
    expect(hasBookDecor(line)).toBe(false)
    expect(line.hasAttribute('data-bk-tail')).toBe(false)
    expect(line.textContent).toBe(text)
  })

  it('בלי מדידה (jsdom, גובה שורה 0) — layoutBookLine לא נוגע בשורה', () => {
    const { host } = setup(raw)
    const line = lineElements(host)[0]
    const html = line.innerHTML
    const res = layoutBookLine(line, { window: true, funnel: true, justify: true, lh: 0, fontPx: 18, rtl: true })
    expect(res.plan).toBeNull()
    expect(line.innerHTML).toBe(html)
  })

  it('שורת כותרת — בלי קישוטים', () => {
    const { host } = setup('<h2>כותרת ארוכה מאוד</h2>')
    const line = lineElements(host)[0]
    layoutBookLine(line, { window: true, funnel: true, justify: true, lh: 30, fontPx: 18, rtl: true })
    expect(hasBookDecor(line)).toBe(false)
  })
})

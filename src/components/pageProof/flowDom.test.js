import { describe, it, expect, beforeEach } from 'vitest'
import { posFromDom, domFromPos, readDomSelection, setDomSelection, lineSegments, revealInScroller, caretTop } from './flowDom'

// המבנה ש-FlowEditor מצייר: שורה 4 מתחלקת בין שתי פסקאות (הפסקה השנייה
// מתחילה במילה 2, בתו 8), שורה 7 ריקה, מספר-קישור (sup בלי טקסט) אחרי מילה
function mount() {
  document.body.innerHTML = `
    <div id="root">
      <p data-para="3:0"><button data-gutter="">✓</button><span data-line="3" data-start="0" data-end="9"><span data-w="0">דלת</span> <span data-w="1">הא</span> <span data-w="2">וו</span></span><span data-sep=""> </span><span data-line="4" data-start="0" data-end="7"><span data-w="0">זין</span> <span data-w="1">חית<sup data-badge="①"></sup></span></span></p>
      <p data-para="4:2"><span data-line="4" data-start="8" data-end="15"><span data-w="2">טית</span> <span data-w="3">יוד</span></span><span data-sep=""> </span><span data-line="7" data-start="0" data-end="0" data-empty="1"><span data-zw="">​</span></span></p>
    </div>`
  return document.getElementById('root')
}

const text = (sel) => document.querySelector(sel).firstChild

describe('flowDom — מיפוי DOM ↔ מודל', () => {
  let root
  beforeEach(() => {
    root = mount()
  })

  it('posFromDom: בתוך מילה, ברווח, אחרי מספר-קישור, בקטע השני של שורה', () => {
    expect(posFromDom(root, text('[data-line="3"] [data-w="1"]'), 1)).toEqual({ lineId: 3, offset: 5 })
    const space = document.querySelector('[data-line="3"]').childNodes[1]
    expect(posFromDom(root, space, 1)).toEqual({ lineId: 3, offset: 4 })
    const hit = document.querySelector('[data-line="4"] [data-w="1"]')
    expect(posFromDom(root, hit, hit.childNodes.length)).toEqual({ lineId: 4, offset: 7 }, 'ה-sup אינו טקסט')
    expect(posFromDom(root, text('[data-start="8"] [data-w="3"]'), 2)).toEqual({ lineId: 4, offset: 14 })
  })

  it('posFromDom: הרווח בין שורות — לפניו סוף השורה הקודמת, אחריו תחילת הבאה', () => {
    const sep = document.querySelector('[data-para="3:0"] [data-sep]')
    expect(posFromDom(root, sep.firstChild, 0)).toEqual({ lineId: 3, offset: 9 })
    // כך Chromium מדווח על סמן בתחילת שורת-המשך — הקלדה שם שייכת לשורה 4
    expect(posFromDom(root, sep.firstChild, 1)).toEqual({ lineId: 4, offset: 0 })
    expect(posFromDom(root, sep, 0)).toEqual({ lineId: 3, offset: 9 })
    expect(posFromDom(root, sep, 1)).toEqual({ lineId: 4, offset: 0 })
    // שורת-המשך ריקה: אחרי הרווח = השורה הריקה
    const sep2 = document.querySelector('[data-para="4:2"] [data-sep]')
    expect(posFromDom(root, sep2.firstChild, 1)).toEqual({ lineId: 7, offset: 0 })
    expect(posFromDom(root, sep2.firstChild, 0)).toEqual({ lineId: 4, offset: 15 })
  })

  it('posFromDom: שורה ריקה; נקודה ברמת-פסקה; מחוץ לעורך', () => {
    expect(posFromDom(root, text('[data-zw]'), 1)).toEqual({ lineId: 7, offset: 0 })
    const p = document.querySelector('[data-para="3:0"]')
    expect(posFromDom(root, p, 0)).toEqual({ lineId: 3, offset: 0 }, 'לפני כפתור-האישור ← תחילת הפסקה')
    expect(posFromDom(root, p, p.childNodes.length)).toEqual({ lineId: 4, offset: 7 })
    expect(posFromDom(root, root, root.childNodes.length)).toEqual({ lineId: 7, offset: 0 })
    expect(posFromDom(root, document.body, 0)).toBeNull()
  })

  it('domFromPos: הקטע הנכון של שורה מתחלקת, וחזרה הלוך-ושוב', () => {
    for (const pos of [
      { lineId: 3, offset: 0 },
      { lineId: 3, offset: 5 },
      { lineId: 3, offset: 9 },
      { lineId: 4, offset: 2 },
      { lineId: 4, offset: 7 },
      { lineId: 4, offset: 8 },
      { lineId: 4, offset: 15 },
      { lineId: 7, offset: 0 },
    ]) {
      const d = domFromPos(root, pos)
      expect(posFromDom(root, d.node, d.offset)).toEqual(pos)
    }
    expect(domFromPos(root, { lineId: 99, offset: 0 })).toBeNull()
    expect(lineSegments(root, 4)).toHaveLength(2)
  })

  it('setDomSelection / readDomSelection', () => {
    const sel = { anchor: { lineId: 3, offset: 4 }, focus: { lineId: 4, offset: 12 } }
    expect(setDomSelection(root, sel)).toBe(true)
    expect(readDomSelection(root)).toEqual(sel)
    expect(setDomSelection(root, { anchor: { lineId: 99, offset: 0 } })).toBe(false)
    window.getSelection().removeAllRanges()
    expect(readDomSelection(root)).toBeNull()
  })

  it('revealInScroller: גולל רק את אזור-הטקסט, ורק כשהמקום מחוץ לתצוגה', () => {
    const box = document.createElement('div')
    box.setAttribute('data-proof-text-scroll', '')
    document.body.appendChild(box)
    box.appendChild(root)
    box.getBoundingClientRect = () => ({ top: 100, bottom: 400, left: 0, right: 500, height: 300, width: 500 })
    const seg = document.querySelector('[data-line="7"]')
    const place = (top) => {
      seg.getBoundingClientRect = () => ({ top, bottom: top + 30, left: 0, right: 100, height: 30, width: 100 })
      seg.firstChild.getBoundingClientRect = seg.getBoundingClientRect
    }
    box.scrollTop = 0
    place(200)
    expect(revealInScroller(root, { lineId: 7, offset: 0 })).toBe(0)
    expect(box.scrollTop).toBe(0)
    place(900)
    expect(revealInScroller(root, { lineId: 7, offset: 0 })).toBeGreaterThan(0)
    expect(revealInScroller(root, { lineId: 99, offset: 0 })).toBe(0)
    // בלי אזור-גלילה מסומן — כלום
    expect(revealInScroller(mount(), { lineId: 7, offset: 0 })).toBe(0)
  })

  it('caretTop: ראש הסמן (Range מכווץ) בפיקסל שלם; null כשהמקום אינו מוצג או כולו מחוץ לאזור-הגלילה', () => {
    const box = document.createElement('div')
    box.setAttribute('data-proof-text-scroll', '')
    document.body.appendChild(box)
    box.appendChild(root)
    box.getBoundingClientRect = () => ({ top: 100, bottom: 400, left: 0, right: 500, height: 300, width: 500 })
    const proto = window.Range.prototype
    const had = Object.hasOwn(proto, 'getBoundingClientRect')
    const orig = proto.getBoundingClientRect
    let top = 180.4
    // jsdom אינו מחשב פריסה: המלבן של הסמן — לפי השורה שבה הוא (כמו בדפדפן)
    proto.getBoundingClientRect = function () {
      const el = this.startContainer.nodeType === 1 ? this.startContainer : this.startContainer.parentElement
      const line = Number(el.closest('[data-line]')?.dataset.line)
      const t = line === 4 && this.startOffset > 0 ? top + 42 : top
      return { top: t, bottom: t + 26, left: 10, right: 10, height: 26, width: 0 }
    }
    try {
      expect(caretTop(root, { lineId: 3, offset: 2 })).toBe(180)
      // אותה שורת-סריקה, השורה הנראית הבאה (שבירה בטקסט) — ראש השורה של הסמן עצמו
      expect(caretTop(root, { lineId: 4, offset: 2 })).toBe(222)
      expect(caretTop(root, { lineId: 99, offset: 0 })).toBeNull()
      // כולו מעל אזור-הגלילה / מתחתיו — אין מול מה ליישר; חלקו בפנים — כן
      top = 40
      expect(caretTop(root, { lineId: 3, offset: 0 })).toBeNull()
      top = 90
      expect(caretTop(root, { lineId: 3, offset: 0 })).toBe(90)
      top = 401
      expect(caretTop(root, { lineId: 3, offset: 0 })).toBeNull()
      // אזור-גלילה בלי גודל (לא מוצג) — אין לפי מה לפסול
      box.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0 })
      expect(caretTop(root, { lineId: 3, offset: 0 })).toBe(401)
    } finally {
      if (had) proto.getBoundingClientRect = orig
      else delete proto.getBoundingClientRect
    }
  })
})

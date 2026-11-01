// עימוד ספר בתצוגה המעוצבת (RichTextArea) — המדידה וההחלה על ה-DOM. התצוגה בלבד: המחרוזת
// השמורה, טקסט התצוגה וההיסטים לא משתנים. הלוגיקה הטהורה — bookLayoutPlan.js.
//
// "חלון": המילה הראשונה בגודל רגיל, השורה הראשונה מלאה, והשורה השנייה נכנסת מהצד ההתחלתי
// ברוחב המילה הראשונה (כולל הרווח) — חלון ריק מתחתיה. סיום משולש: השורות האחרונות מצטמצמות
// בהדרגה וממורכזות.
//
// איך: floats ריקים בתחילת השורה הלוגית — <span class="rt-bk" contenteditable=false aria-hidden>
// בלי צומתי טקסט, ולכן textContent / Range.toString (המיפוי של richDom) לא מושפעים מהם.
// float "מרווח" ברוחב 0 מוריד את ה-float הבא (clear) לגובה הנכון: החלון — לשורה השנייה; צורות
// הסיומת (shape-outside מדורג, אחת לכל צד) — לשורה הראשונה של הסיומת. סדר ה-floats ב-DOM
// קובע: float לא עולה מעל float שקדם לו, ולכן: [מרווח-חלון, חלון, מרווח-התחלה, מרווח-סוף,
// צורה-התחלה, צורה-סוף].

import { BOOK_EPS, WINDOW_MAX_FRACTION, clusterRows, firstWordSpan, scoreTail, stepOk, stepPolygon, tailCandidates } from './bookLayoutPlan'

export const BOOK_DECO_CLASS = 'rt-bk'

/** @typedef {{ m: number, k: number, s: number, target: number }} TailPlan */
/** @typedef {{ window: boolean, funnel: boolean, justify: boolean, lh: number, fontPx: number, rtl: boolean }} BookOpts */

const textNodes = (el) => {
  const out = []
  const w = el.ownerDocument.createTreeWalker(el, 4 /* SHOW_TEXT */)
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n)
  return out
}

function pointAt(lineEl, off) {
  const ts = textNodes(lineEl)
  for (const t of ts) {
    if (off <= t.length) return { node: t, offset: off }
    off -= t.length
  }
  const t = ts[ts.length - 1]
  return t ? { node: t, offset: t.length } : null
}

/** מסיר את הקישוטים של שורה לוגית */
export function clearBookLine(lineEl) {
  for (const d of [...lineEl.children]) if (d.classList.contains(BOOK_DECO_CLASS)) d.remove()
  lineEl.removeAttribute('data-bk-tail')
}

/** יש בשורה קישוטים? */
export const hasBookDecor = (lineEl) => [...lineEl.children].some((d) => d.classList.contains(BOOK_DECO_CLASS))

function deco(doc, kind, css) {
  const s = doc.createElement('span')
  s.className = `${BOOK_DECO_CLASS} ${BOOK_DECO_CLASS}-${kind}`
  s.setAttribute('contenteditable', 'false')
  s.setAttribute('aria-hidden', 'true')
  s.style.cssText = css
  return s
}

/** שורות המסך של שורה לוגית (מרכז יחסית לראש תוכן השורה, קצוות בפיקסלים של המסך) */
function measureRows(lineEl, lh) {
  const top0 = lineEl.getBoundingClientRect().top + lineEl.clientTop
  const r = lineEl.ownerDocument.createRange()
  const rects = []
  for (const t of textNodes(lineEl)) {
    r.selectNodeContents(t)
    for (const x of r.getClientRects()) rects.push({ top: x.top - top0, bottom: x.bottom - top0, left: x.left, right: x.right })
  }
  return clusterRows(rects, lh)
}

/** הרווח הגדול בין מילים (em) בשורות [start, end-1) — כמה היישור לשני הצדדים "מותח" */
function tailGapEm(lineEl, start, end, lh, fontPx) {
  const top0 = lineEl.getBoundingClientRect().top + lineEl.clientTop
  const r = lineEl.ownerDocument.createRange()
  const rows = measureRows(lineEl, lh)
  const rowOf = (c) => rows.findIndex((x) => Math.abs(x.c - c) < lh / 2)
  /** @type {Map<number, { w: number, n: number, l: number, r: number }>} */
  const acc = new Map()
  const ts = textNodes(lineEl)
  outer: for (let ti = ts.length - 1; ti >= 0; ti--) {
    const t = ts[ti]
    const words = [...t.data.matchAll(/\S+/gu)]
    for (let wi = words.length - 1; wi >= 0; wi--) {
      const w = words[wi]
      r.setStart(t, w.index)
      r.setEnd(t, w.index + w[0].length)
      const x = r.getBoundingClientRect()
      const i = rowOf((x.top + x.bottom) / 2 - top0)
      if (i < 0) continue
      if (i < start) break outer
      if (i >= end - 1) continue
      const a = acc.get(i) || { w: 0, n: 0, l: Infinity, r: -Infinity }
      a.w += x.width
      a.n++
      a.l = Math.min(a.l, x.left)
      a.r = Math.max(a.r, x.right)
      acc.set(i, a)
    }
  }
  let worst = 0
  for (const a of acc.values()) if (a.n > 1) worst = Math.max(worst, (a.r - a.l - a.w) / (a.n - 1) / fontPx)
  return worst
}

/** שורה שכולה כותרת (h1–h4) או בלי טקסט — בלי עימוד ספר */
function skipLine(lineEl) {
  const ts = [...lineEl.querySelectorAll('.rt-t')]
  if (!ts.some((t) => t.textContent.trim())) return true
  return ts.every((t) => !t.textContent.trim() || /\brt-h[1-4]\b/.test(t.className))
}

/**
 * עימוד שורה לוגית אחת. מחזיר את תוכנית הסיומת (לשימוש חוזר במסלול המהיר) או null.
 * @param {HTMLElement} lineEl
 * @param {BookOpts} o
 * @param {TailPlan|null} [prev] התוכנית הקודמת של השורה — מנסים אותה קודם (הקלדה)
 * @returns {{ plan: TailPlan|null, tries: number }}
 */
export function layoutBookLine(lineEl, o, prev = null) {
  clearBookLine(lineEl)
  const res = { plan: null, tries: 0 }
  if ((!o.window && !o.funnel) || !(o.lh > 0) || skipLine(lineEl)) return res
  const doc = lineEl.ownerDocument
  const { lh } = o
  const full = lineEl.clientWidth
  const startSide = 'inline-start'
  const endSide = 'inline-end'
  let rows = measureRows(lineEl, lh)
  if (rows.length < 2) return res

  // ---- חלון ----
  let winTop = 0
  const anchor = []
  if (o.window) {
    const span = firstWordSpan(lineEl.textContent || '')
    const a = span && pointAt(lineEl, span.start)
    const b = span && pointAt(lineEl, span.end)
    if (a && b) {
      const r = doc.createRange()
      r.setStart(a.node, a.offset)
      r.setEnd(b.node, b.offset)
      const top0 = lineEl.getBoundingClientRect().top + lineEl.clientTop
      let l = Infinity
      let rr = -Infinity
      for (const x of r.getClientRects()) {
        if (Math.abs((x.top + x.bottom) / 2 - top0 - rows[0].c) >= lh / 2) continue
        l = Math.min(l, x.left)
        rr = Math.max(rr, x.right)
      }
      const w = rr - l
      if (w > 0 && w <= full * WINDOW_MAX_FRACTION) {
        winTop = Math.max(0, rows[1].c - lh / 2) + BOOK_EPS
        const sp = deco(doc, 'sp', `float:${startSide};width:0;height:${winTop}px`)
        const win = deco(doc, 'win', `float:${startSide};clear:${startSide};width:${w}px;height:${lh - 2 * BOOK_EPS}px`)
        lineEl.prepend(sp, win)
        anchor.push(win)
        rows = measureRows(lineEl, lh)
      }
    }
  }
  if (!o.funnel) return res

  // ---- סיום משולש ----
  const n = rows.length
  const last = rows[n - 1]
  const r0 = (last.r - last.l) / full
  const firstAllowed = anchor.length ? 3 : 1
  /** @type {HTMLElement[]} */
  let els = []
  const physStart = o.rtl ? 'right' : 'left'
  const physEnd = o.rtl ? 'left' : 'right'
  const apply = (c) => {
    els.forEach((e) => e.remove())
    const start = n - c.m
    const T = Math.max(0, rows[start].c - lh / 2)
    const step = (c.s / 2) * full
    const W = Math.ceil(step * c.k) + 1
    const H = c.k * lh
    const sp = Math.max(0, T - winTop)
    const mk = (side, phys, kind) => {
      const f = deco(doc, kind, `float:${side};clear:${side};width:${W}px;height:${H}px`)
      f.style.shapeOutside = stepPolygon(phys, W, step, c.k, lh)
      return f
    }
    els = [
      deco(doc, 'sp', `float:${startSide};width:0;height:${sp}px`),
      deco(doc, 'sp', `float:${endSide};width:0;height:${sp}px`),
      mk(startSide, physStart, 'tail'),
      mk(endSide, physEnd, 'tail')
    ]
    if (anchor.length) anchor[0].after(...els)
    else lineEl.prepend(...els)
    return start
  }
  const evalC = (c) => {
    res.tries++
    const start = apply(c)
    const m = measureRows(lineEl, lh)
    const used = Math.max(1, Math.min(c.k, m.length - start))
    const lm = m[m.length - 1]
    const lastFill = lm ? (lm.r - lm.l) / ((1 - used * c.s) * full) : 0
    const bad = m.length > start + c.k || used < 2
    const gapEm = o.justify && !bad ? tailGapEm(lineEl, start, m.length, lh, o.fontPx) : 0
    const { sc } = scoreTail(c, { start, rows: m.length, lastFill, gapEm })
    return { ...c, sc, used }
  }
  let best = null
  if (prev && n - prev.m + 1 >= firstAllowed && prev.m <= n) {
    best = evalC(prev)
    if (best.sc >= 3) best = null
  }
  if (!best) {
    for (const c of tailCandidates(n, r0, firstAllowed, full / (o.fontPx * 3.3))) {
      const e = evalC(c)
      if (!best || e.sc < best.sc) best = e
      if (best.sc < 0.5) break
    }
    if (best && best.sc >= 1.5 && best.sc < 100) {
      for (const f of [0.8, 0.9, 1.1, 1.2]) {
        const s = best.s * f
        if (!stepOk(best.k, s)) continue
        const e = evalC({ ...best, s })
        if (e.sc < best.sc) best = e
      }
    }
  }
  els.forEach((e) => e.remove())
  els = []
  if (!best || best.sc >= 100) return res
  // מדרגה אחרונה שלא נוצלה — מקצרים את הצורה (אחרת היא משאירה שורה ריקה בסוף הפסקה)
  const plan = { m: best.m, k: Math.max(2, best.used), s: best.s, target: best.target }
  apply(plan)
  lineEl.setAttribute('data-bk-tail', '')
  res.plan = plan
  return res
}

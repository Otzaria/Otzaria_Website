// מיפוי בין ה-DOM של FlowEditor לבין המודל ({lineId, offset} — היסט-תווים
// בטקסט הנוכחי של השורה). תלוי-DOM (Range/Selection), ולכן כאן ולא ב-lib;
// נבדק ב-vitest (jsdom).
//
// המבנה ש-FlowEditor מצייר:
//   <p data-para>
//     [כפתור-אישור contentEditable=false — מחוץ לשורות]
//     <span data-line={id} data-start={s} data-end={e} [data-empty]>  ← קטע-שורה
//       מילים (<span data-w={i}>) ורווחים; הקטע מציג את text.slice(s, e)
//     </span>
//     <span data-sep> </span>   ← רווח בין שתי שורות של אותה פסקה (לפניו =
//                                  סוף השורה הקודמת, אחריו = תחילת הבאה)
//     <span data-line …>
//   </p>
// קישוטים (מספר-קישור, "ממתינה לזיהוי מחדש", "שורה ריקה") מצוירים ב-CSS
// (content: attr(...)) ואין להם צמתי-טקסט — לכן הטקסט של Range בתוך קטע-שורה
// הוא בדיוק הטקסט של השורה, והיסט = data-start + אורכו.
// שורה ריקה מכילה רווח ברוחב-אפס (כדי שהסמן יוכל להיכנס אליה) — data-empty,
// וכל מקום בה = היסט data-start.

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export function segInfo(el) {
  return {
    lineId: num(el?.dataset?.line, NaN),
    start: num(el?.dataset?.start),
    end: num(el?.dataset?.end),
    empty: el?.dataset?.empty === '1',
  }
}

const startOf = (el) => {
  const s = segInfo(el)
  return { lineId: s.lineId, offset: s.start }
}
const endOf = (el) => {
  const s = segInfo(el)
  return { lineId: s.lineId, offset: s.empty ? s.start : s.end }
}

// קטעי-השורה של שורה (שורה שמתחלקת בין שתי פסקאות — שני קטעים)
export function lineSegments(root, lineId) {
  if (!root || lineId == null) return []
  return [...root.querySelectorAll(`[data-line="${String(lineId).replace(/["\\]/g, '')}"]`)]
}

function textBefore(el, node, offset) {
  const r = el.ownerDocument.createRange()
  try {
    r.setStart(el, 0)
    r.setEnd(node, offset)
  } catch {
    return 0
  }
  return r.toString().length
}

// נקודת-DOM (צומת + היסט) ← מקום במודל, או null אם אינה בעורך
export function posFromDom(root, node, offset) {
  if (!root || !node || !root.contains(node)) return null
  const el = node.nodeType === 1 ? node : node.parentElement
  if (!el) return null
  const line = el.closest('[data-line]')
  if (line && root.contains(line)) {
    const s = segInfo(line)
    if (!Number.isFinite(s.lineId)) return null
    if (s.empty) return { lineId: s.lineId, offset: s.start }
    return { lineId: s.lineId, offset: Math.min(s.start + textBefore(line, node, offset), s.end) }
  }
  // הרווח בין שתי שורות של פסקה: לפניו = סוף השורה שלפניו; אחריו = תחילת
  // השורה שאחריו. Chromium מדווח על סמן בתחילת שורת-המשך (לחיצה לפני האות
  // הראשונה, או ← מסוף השורה הקודמת) כ"אחרי הרווח" — אילו מופה לסוף השורה
  // הקודמת, הקלדה שם הייתה נכנסת לשורה הקודמת ו-Backspace מוחק ממנה אות
  const sep = el.closest('[data-sep]')
  if (sep && root.contains(sep)) {
    if (textBefore(sep, node, offset) > 0) {
      let next = sep.nextElementSibling
      while (next && !next.matches('[data-line]')) next = next.nextElementSibling
      if (next) return startOf(next)
    }
    let prev = sep.previousElementSibling
    while (prev && !prev.matches('[data-line]')) prev = prev.previousElementSibling
    if (prev) return endOf(prev)
  }
  const segs = [...root.querySelectorAll('[data-line]')]
  if (!segs.length) return null
  // סוף פסקה ← סוף הקטע האחרון בה
  if (el.matches?.('[data-para]') && node === el && offset >= el.childNodes.length) {
    const own = el.querySelectorAll('[data-line]')
    if (own.length) return endOf(own[own.length - 1])
  }
  // נקודה ברמת-אלמנט (בין פסקאות, ליד כפתור-האישור…) ← תחילת הקטע הבא
  const r = root.ownerDocument.createRange()
  try {
    r.setStart(node, offset)
    r.collapse(true)
  } catch {
    return null
  }
  for (const s of segs) {
    if (r.comparePoint(s, 0) >= 0) return startOf(s)
  }
  return endOf(segs[segs.length - 1])
}

// מקום במודל ← נקודת-DOM {node, offset}, או null אם השורה אינה מוצגת
export function domFromPos(root, pos) {
  if (!root || !pos) return null
  const segs = lineSegments(root, pos.lineId)
  if (!segs.length) return null
  const off = num(pos.offset)
  let el = segs.find((s) => {
    const g = segInfo(s)
    return off >= g.start && off <= g.end
  })
  if (!el) el = segs.find((s) => segInfo(s).start >= off) || segs[segs.length - 1]
  const g = segInfo(el)
  const doc = el.ownerDocument
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */)
  let local = Math.max(0, Math.min(off, g.end) - g.start)
  let last = null
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (g.empty) return { node: t, offset: 0 }
    const len = t.nodeValue.length
    if (local <= len) return { node: t, offset: local }
    local -= len
    last = t
  }
  if (last) return { node: last, offset: last.nodeValue.length }
  return { node: el, offset: 0 }
}

// הבחירה בדפדפן ← {anchor, focus} במודל; null אם אינה בתוך העורך
export function readDomSelection(root) {
  const s = root?.ownerDocument?.getSelection?.()
  if (!s || !s.rangeCount || !s.anchorNode || !s.focusNode) return null
  if (!root.contains(s.anchorNode) || !root.contains(s.focusNode)) return null
  const anchor = posFromDom(root, s.anchorNode, s.anchorOffset)
  const focus = posFromDom(root, s.focusNode, s.focusOffset)
  return anchor && focus ? { anchor, focus } : null
}

// {anchor, focus} במודל ← הבחירה בדפדפן. false אם אחד הקצוות אינו מוצג.
export function setDomSelection(root, sel) {
  const doc = root?.ownerDocument
  const s = doc?.getSelection?.()
  if (!s || !sel?.anchor) return false
  const a = domFromPos(root, sel.anchor)
  const f = domFromPos(root, sel.focus || sel.anchor)
  if (!a || !f) return false
  try {
    if (typeof s.setBaseAndExtent === 'function') {
      s.setBaseAndExtent(a.node, a.offset, f.node, f.offset)
    } else {
      const r = doc.createRange()
      r.setStart(a.node, a.offset)
      r.setEnd(f.node, f.offset)
      s.removeAllRanges()
      s.addRange(r)
    }
    return true
  } catch {
    return false
  }
}

// הטווח שהדפדפן חישב לפעולה (beforeinput.getTargetRanges) ← {start, end} במודל
export function targetRange(root, e) {
  const r = typeof e?.getTargetRanges === 'function' ? e.getTargetRanges()[0] : null
  if (!r) return null
  const start = posFromDom(root, r.startContainer, r.startOffset)
  const end = posFromDom(root, r.endContainer, r.endOffset)
  return start && end ? { start, end } : null
}

// האלמנט של קטע-השורה שבו המקום (לגלילה אליו)
export function segmentElement(root, pos) {
  const p = domFromPos(root, pos)
  if (!p) return null
  const el = p.node.nodeType === 1 ? p.node : p.node.parentElement
  return el?.closest?.('[data-line]') || el
}

// המלבן על המסך של מקום במודל: של הסמן עצמו (Range מכווץ), ואם הדפדפן לא
// נותן — של האלמנט שבו הוא
function posRect(root, pos) {
  const p = domFromPos(root, pos)
  if (!p) return null
  try {
    const r = root.ownerDocument.createRange()
    r.setStart(p.node, p.offset)
    r.collapse(true)
    const rect = typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect() : null
    if (rect && (rect.top || rect.bottom || rect.height)) return rect
  } catch {
    /* נקודה לא תקינה — המלבן של האלמנט */
  }
  const el = p.node.nodeType === 1 ? p.node : p.node.parentElement
  return typeof el?.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
}

// ה-clientY של ראש הסמן במקום pos (בשביל הסריקה, שמעמידה את השורה שלה מול
// השורה של הסמן): ראש המלבן של Range מכווץ במקום — השורה *הנראית* שבה הסמן, גם
// כששורת-סריקה אחת נשברת בטקסט לשתי שורות. null כשהמקום אינו מוצג, או כשהוא כולו
// מחוץ לאזור-הגלילה של הטקסט (box; ברירת-מחדל: העוטף data-proof-text-scroll) —
// אז אין מול מה ליישר. מעוגל לפיקסל שלם, כדי שתזוזה של שבריר לא תיחשב שינוי.
export function caretTop(root, pos, box = null) {
  const rect = posRect(root, pos)
  if (!rect || !Number.isFinite(rect.top)) return null
  const scroller = box || root?.closest?.('[data-proof-text-scroll]') || null
  const c = typeof scroller?.getBoundingClientRect === 'function' ? scroller.getBoundingClientRect() : null
  if (c && c.bottom > c.top && (rect.bottom < c.top || rect.top > c.bottom)) return null
  return Math.round(rect.top)
}

// גלילת אזור-הטקסט (ורק הוא — לא החלון) כך שהמקום ייראה; רק כשהוא מחוץ לתצוגה.
// scrollIntoView היה גולל גם את הדף כולו (בפריסה הצרה הלוחות זה מעל זה), וזה
// קופץ מתחת לעכבר של מי שלחץ על הסריקה. box = אזור-הגלילה (ברירת-מחדל: העוטף
// המסומן data-proof-text-scroll). מחזיר את מרחק-הגלילה (0 = לא נגלל).
export function revealInScroller(root, pos, box = null) {
  const scroller = box || root?.closest?.('[data-proof-text-scroll]') || null
  if (!scroller || typeof scroller.getBoundingClientRect !== 'function') return 0
  const rect = posRect(root, pos)
  const c = scroller.getBoundingClientRect()
  if (!rect || !(c.bottom > c.top)) return 0
  const margin = Math.min(40, (c.bottom - c.top) / 4)
  let d = 0
  if (rect.top < c.top + margin) d = rect.top - c.top - margin
  else if (rect.bottom > c.bottom - margin) d = rect.bottom - c.bottom + margin
  if (d) scroller.scrollTop += d
  return d
}

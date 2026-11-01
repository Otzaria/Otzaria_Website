// ה-DOM של התצוגה המעוצבת (RichTextArea): בניית השורות מהמודל (richMap) והמרה בין נקודה
// ב-DOM להיסט במחרוזת השמורה. התוכן נבנה ב-createElement/createTextNode בלבד (לא innerHTML) —
// הטקסט של המשתמש לעולם לא מתפרש כ-HTML.
//
// מבנה: כל שורה לוגית = <div class="rt-line" data-l>. טקסט = <span class="rt-t rt-b ...">
// עם צומת טקסט אחד. תגים מוכרים לא מופיעים ב-DOM בכלל; תגים לא מוכרים וישויות = <span
// contenteditable=false class="rt-chip" data-label> שהתווית שלו ב-CSS (::before) — כך ש-
// textContent של שורה הוא בדיוק טקסט התצוגה שלה, וההיסט בשורה = אורך Range.toString().

import { displayToRaw, lineOfDisplay, rawToDisplay } from './richMap'

/** @typedef {import('./richMap').RichIndex} RichIndex */

const LINE_CLASS = 'rt-line'

/** @param {import('./richMap').RichLine} line @param {Document} doc */
export function buildLineElement(line, doc) {
  const el = doc.createElement('div')
  el.className = LINE_CLASS
  let hasText = false
  for (const p of line.parts) {
    const span = doc.createElement('span')
    if (p.kind === 'text') {
      span.className = ['rt-t', ...p.cls.map((c) => `rt-${c}`)].join(' ')
      span.appendChild(doc.createTextNode(p.text))
      hasText = true
    } else {
      span.className = `rt-chip rt-chip-${p.chip}`
      span.setAttribute('contenteditable', 'false')
      span.setAttribute('data-label', p.label)
    }
    el.appendChild(span)
  }
  // שורה בלי טקסט — <br> כדי שיהיה לה גובה ומקום לסמן
  if (!hasText) el.appendChild(doc.createElement('br'))
  Object.assign(el, { __rtKey: line.key })
  return el
}

/** שורות ה-DOM של השדה (בסדר) */
export const lineElements = (host) => [...host.children].filter((c) => c.classList?.contains(LINE_CLASS))

/**
 * עדכון ה-DOM לאינדקס חדש: רק השורות שהשתנו (תחילית וסיפא משותפות נשארות כמו שהן).
 * force — בנייה מחדש של הכל (אחרי שהדפדפן שינה את ה-DOM בעצמו, למשל IME).
 * @param {HTMLElement} host
 * @param {RichIndex} index
 * @param {boolean} [force]
 */
export function renderInto(host, index, force = false) {
  const doc = host.ownerDocument
  const old = lineElements(host)
  // צמתים זרים (שהדפדפן הכניס) — החוצה
  for (const c of [...host.childNodes]) if (!old.includes(c)) host.removeChild(c)
  const next = index.lines
  if (force) {
    host.replaceChildren(...next.map((l) => buildLineElement(l, doc)))
    return
  }
  const same = (el, l) => /** @type {any} */ (el).__rtKey === l.key
  let pre = 0
  while (pre < old.length && pre < next.length && same(old[pre], next[pre])) pre++
  let suf = 0
  while (suf < old.length - pre && suf < next.length - pre && same(old[old.length - 1 - suf], next[next.length - 1 - suf])) suf++
  const anchor = old[old.length - suf] || null
  for (let i = pre; i < old.length - suf; i++) host.removeChild(old[i])
  for (let i = pre; i < next.length - suf; i++) host.insertBefore(buildLineElement(next[i], doc), anchor)
}

/** צומתי הטקסט של שורה, בסדר */
function textNodes(lineEl) {
  const out = []
  const doc = lineEl.ownerDocument
  const walker = doc.createTreeWalker(lineEl, 4 /* SHOW_TEXT */)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n)
  return out
}

/**
 * נקודה ב-DOM → היסט במחרוזת השמורה. bias לפי הצומת: בתחילת צומת טקסט — אחרי התגים שלפניו
 * (בתוך העיצוב של הצומת), בסופו — לפני התגים שאחריו.
 * @param {HTMLElement} host
 * @param {RichIndex} index
 * @param {Node|null} node
 * @param {number} offset
 * @returns {number|null} null — הנקודה מחוץ לשדה
 */
export function rawFromDomPoint(host, index, node, offset) {
  if (!node || !host.contains(node)) return null
  const lines = lineElements(host)
  if (node === host) {
    // בין שורות: תחילת השורה שאחרי הנקודה (או סוף הטקסט)
    const child = host.childNodes[offset]
    const li = child ? lines.indexOf(child) : -1
    if (li < 0) return index.raw.length
    return displayToRaw(index, index.lines[li]?.dispStart ?? 0, 'after')
  }
  const el = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement
  const lineEl = el?.closest(`.${LINE_CLASS}`)
  const li = lineEl ? lines.indexOf(lineEl) : -1
  if (!lineEl || li < 0 || !index.lines[li]) return null
  const doc = host.ownerDocument
  const r = doc.createRange()
  r.setStart(lineEl, 0)
  // נקודה בתוך שבב (לא אמור לקרות) — לפני השבב
  const chip = el.closest('.rt-chip')
  if (chip && chip !== lineEl) r.setEndBefore(chip)
  else r.setEnd(node, offset)
  const d = r.toString().length
  let bias = 'before'
  if (chip && chip !== lineEl) bias = 'before'
  else if (node.nodeType === 3) bias = offset === 0 ? 'after' : 'before'
  else {
    const prev = node.childNodes[offset - 1]
    // לפני הנקודה שבב, או קישוט של עימוד הספר (float ריק בתחילת השורה, bookLayout.js) — כמו תחילת צומת
    const cls = prev && prev.nodeType === 1 ? /** @type {Element} */ (prev).classList : null
    bias = offset === 0 || !prev || (cls && (cls.contains('rt-chip') || cls.contains('rt-bk'))) ? 'after' : 'before'
  }
  const local = Math.min(d, index.lines[li].parts.reduce((n, p) => n + (p.kind === 'text' ? p.text.length : 0), 0))
  return displayToRaw(index, index.lines[li].dispStart + local, /** @type {'before'|'after'} */ (bias))
}

/**
 * היסט במחרוזת → נקודה ב-DOM ({ node, offset }).
 * @param {HTMLElement} host
 * @param {RichIndex} index
 * @param {number} p
 */
export function domPointFromRaw(host, index, p) {
  const { d, bias } = rawToDisplay(index, p)
  const li = lineOfDisplay(index, d)
  const lineEl = lineElements(host)[li]
  if (!lineEl) return { node: host, offset: host.childNodes.length }
  let local = d - index.lines[li].dispStart
  const nodes = textNodes(lineEl)
  if (!nodes.length) return { node: lineEl, offset: 0 }
  for (let i = 0; i < nodes.length; i++) {
    const len = nodes[i].length
    if (local < len) return { node: nodes[i], offset: local }
    if (local === len && (bias === 'before' || i === nodes.length - 1)) return { node: nodes[i], offset: len }
    local -= len
  }
  const last = nodes[nodes.length - 1]
  return { node: last, offset: last.length }
}

/**
 * Range על הטווח [a, b) במחרוזת — מכווץ לטקסט הנראה (בלי התגים שבקצוות).
 * @param {HTMLElement} host
 * @param {RichIndex} index
 */
export function domRangeFromRaw(host, index, a, b) {
  const doc = host.ownerDocument
  const r = doc.createRange()
  const s = domPointFromRaw(host, index, displayToRaw(index, rawToDisplay(index, a).d, 'after'))
  const e = domPointFromRaw(host, index, displayToRaw(index, rawToDisplay(index, b).d, 'before'))
  r.setStart(s.node, s.offset)
  r.setEnd(e.node, e.offset)
  if (r.collapsed && (s.node !== e.node || s.offset !== e.offset)) r.setEnd(s.node, s.offset)
  return r
}

/** טקסט התצוגה מה-DOM (שורות מופרדות ב-'\n') — להשוואה אחרי שהדפדפן שינה את ה-DOM בעצמו */
export function displayFromDom(host) {
  return lineElements(host).map((l) => l.textContent || '').join('\n')
}

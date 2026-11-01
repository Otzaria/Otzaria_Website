// הבקר של התצוגה המעוצבת (RichTextArea): כל ההתנהגות האימפרטיבית של השדה — הממשק התואם-
// textarea, תרגום אירועי העריכה של הדפדפן לעריכות של המחרוזת, בחירה, היסטוריה, IME וסימון
// המעקב. הקומפוננטה (RichTextArea.jsx) רק יוצרת את האלמנטים ומעבירה props.
//
// עיקרון: הדפדפן לא עורך את ה-DOM בעצמו — beforeinput → preventDefault → עריכה של המחרוזת
// (richEdit) → בנייה מחדש של השורות שהשתנו (richDom). חריג אחד: הרכבת IME (לא ניתנת לביטול),
// שבסופה הטקסט הנראה נקרא מה-DOM ומתורגם בחזרה לעריכה של המחרוזת.

import { buildRichIndex, displayWindow, rawToDisplay } from './richMap'
import { deleteAt, insertLineBreak, replaceSelection } from './richEdit'
import { displayFromDom, domPointFromRaw, domRangeFromRaw, lineElements, rawFromDomPoint, renderInto } from './richDom'
import { fieldHistoryEntry, runStructural, syncFieldValue } from './fieldHistoryStore'
import { clearBookLine, layoutBookLine } from './bookLayout'
import { highlightName } from './richStyles'
import { MIRROR_HIGHLIGHT } from './TextMirror'
import { lineWords } from '@/lib/editor/caretWord'
import { suspectWords } from '@/lib/editor/suspectWords'

const SINGLE_GRAPHEME = /^.\p{M}*$/su

/** מלבן של נקודה (היסט) — Range מכווץ, ואם אין לו מלבן: התו שאחריו / לפניו / השורה */
function pointRect(host, index, p) {
  const doc = host.ownerDocument
  const { node, offset } = domPointFromRaw(host, index, p)
  const r = doc.createRange()
  r.setStart(node, offset)
  r.collapse(true)
  let rect = [...(r.getClientRects?.() || [])].find((x) => x.height > 0)
  if (!rect && node.nodeType === 3) {
    const len = /** @type {Text} */ (node).length
    if (offset < len) r.setEnd(node, offset + 1)
    else if (offset > 0) r.setStart(node, offset - 1)
    rect = [...(r.getClientRects?.() || [])].find((x) => x.height > 0)
  }
  if (!rect) {
    const el = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement
    rect = el?.closest('.rt-line')?.getBoundingClientRect() || el?.getBoundingClientRect()
  }
  return rect || null
}

/** סוף האזור שהשתנה בין שני ערכים (תחילית וסיפא משותפות) — מקום הסמן אחרי ביצוע מחדש */
export function redoCaret(before, after) {
  let pre = 0
  while (pre < before.length && pre < after.length && before[pre] === after[pre]) pre++
  let suf = 0
  while (suf < before.length - pre && suf < after.length - pre && before[before.length - 1 - suf] === after[after.length - 1 - suf]) suf++
  return after.length - suf
}

/**
 * @typedef {{ line: number, word: number, estimated?: boolean, lineNumbers?: boolean,
 *   showSuspects?: boolean, strength?: 'strong'|'normal' }} RichTracking
 */

/**
 * @param {HTMLElement} host  ה-div עם contenteditable
 * @param {HTMLElement|null} layer  הרצועה שמאחוריו (פס שורת המסך, סימון בלי Custom Highlight)
 * @param {{ column: string, getProps: () => { onChange?: Function, tracking?: RichTracking|null,
 *   book?: { window?: boolean, funnel?: boolean } | null } }} opts
 */
export function createRichController(host, layer, { column, getProps }) {
  const doc = host.ownerDocument
  // ההיסטוריה של השדה הלוגי (לא של האלמנט) — ממשיכה אחרי מעבר לתצוגת הקוד ובחזרה
  const entry = fieldHistoryEntry(column)
  const st = {
    raw: '',
    index: buildRichIndex(''),
    sel: { start: 0, end: 0, dir: 'none' },
    progSel: false,
    composing: false,
    /** @type {{ start: number, end: number }|null} */
    compSel: null,
    pointer: false,
    // ערכים ששלחנו ב-onChange ועוד לא חזרו כ-value מההורה (תור לפי סדר השליחה). הד שחוזר מאשר
    // אותו ואת כל מה שלפניו — כך ערך ישן שכבר אושר לא נחשב שוב "הד", וערך חיצוני (חיפוש/החלפה,
    // ניקוי ספרות) שבמקרה שווה לערך ששלחנו פעם — כן מוחל.
    /** @type {string[]} */
    emitted: [],
    history: entry.history,
    raf: 0,
    // עימוד ספר (bookLayout.js): חתימת התצוגה שלפיה עומדו השורות, תוכנית הסיומת לכל שורה, rAF
    bk: { sig: '', /** @type {any[]} */ plans: [], raf: 0 }
  }

  // ---------- בחירה ----------
  const isFocused = () => doc.activeElement === host

  const readSelection = () => {
    if (!isFocused() || st.composing) return st.sel
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount) return st.sel
    const ix = st.index
    const a = rawFromDomPoint(host, ix, sel.anchorNode, sel.anchorOffset)
    const f = rawFromDomPoint(host, ix, sel.focusNode, sel.focusOffset)
    if (a == null || f == null) return st.sel
    let start = Math.min(a, f)
    let end = Math.max(a, f)
    const dir = a === f ? 'none' : a < f ? 'forward' : 'backward'
    // בחירה שנקבעה בקוד (חיפוש, setSelectionRange) ולא זזה — ההיסטים המדויקים שנקבעו
    if (st.progSel) {
      const same = (x, y) => rawToDisplay(ix, x).d === rawToDisplay(ix, y).d
      if (same(start, st.sel.start) && same(end, st.sel.end)) return st.sel
      st.progSel = false
    }
    if (start !== end) {
      // בחירה של טקסט: בלי התגים שבקצוות (בחירת מילה מודגשת = המילה, לא <b>המילה</b>)
      const ts = displayWindow(ix, rawToDisplay(ix, start).d).hi
      const te = displayWindow(ix, rawToDisplay(ix, end).d).lo
      if (ts <= te) {
        start = ts
        end = te
      }
    }
    st.sel = { start, end, dir }
    return st.sel
  }

  const applySelection = () => {
    if (!isFocused()) return
    const { start, end, dir } = st.sel
    const a = domPointFromRaw(host, st.index, dir === 'backward' ? end : start)
    const f = start === end ? a : domPointFromRaw(host, st.index, dir === 'backward' ? start : end)
    try {
      doc.getSelection()?.setBaseAndExtent(a.node, a.offset, f.node, f.offset)
    } catch {
      // נקודה לא חוקית (DOM באמצע עדכון) — הבחירה תתעדכן באירוע הבא
    }
  }

  const ensureVisible = () => {
    const rect = pointRect(host, st.index, st.sel.dir === 'backward' ? st.sel.start : st.sel.end)
    if (!rect) return
    const hr = host.getBoundingClientRect()
    const margin = 8
    if (rect.top < hr.top + margin) host.scrollTop -= hr.top + margin - rect.top
    else if (rect.bottom > hr.bottom - margin) host.scrollTop += rect.bottom - (hr.bottom - margin)
  }

  // ---------- סימון המעקב ----------
  const decorate = () => {
    st.raf = 0
    const t = getProps().tracking
    const ix = st.index
    const lines = lineElements(host)
    for (const el of host.querySelectorAll('.rt-line[data-current]')) {
      el.removeAttribute('data-current')
      el.removeAttribute('data-multi')
    }
    const band = /** @type {HTMLElement|null} */ (layer?.querySelector('[data-row-band]') || null)
    const fallback = layer?.querySelector('[data-word-fallback]') || null
    if (band) band.style.display = 'none'
    if (fallback) fallback.replaceChildren()
    const hasHl = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
    const names = { word: highlightName('word', column), est: highlightName('wordest', column), sus: highlightName('sus', column) }
    if (hasHl) Object.values(names).forEach((n) => CSS.highlights.delete(n))
    if (!t) return
    if (t.showSuspects && hasHl) {
      const ranges = []
      ix.lines.forEach((l) => {
        const text = ix.raw.slice(l.rawStart, l.rawEnd)
        const words = lineWords(text)
        for (const s of suspectWords(text)) {
          const w = words[s.index]
          if (w) ranges.push(domRangeFromRaw(host, ix, l.rawStart + w.start, l.rawStart + w.end))
        }
      })
      if (ranges.length) CSS.highlights.set(names.sus, new Highlight(...ranges))
    }
    const lineEl = Number.isInteger(t.line) && t.line >= 0 ? lines[t.line] : null
    if (!lineEl || !ix.lines[t.line]) return
    lineEl.setAttribute('data-current', '')
    const l = ix.lines[t.line]
    const w = Number.isInteger(t.word) && t.word >= 0 ? lineWords(ix.raw.slice(l.rawStart, l.rawEnd))[t.word] : null
    const range = w ? domRangeFromRaw(host, ix, l.rawStart + w.start, l.rawStart + w.end) : null
    if (range && hasHl) CSS.highlights.set(t.estimated ? names.est : names.word, new Highlight(range))
    const wrapper = layer?.parentElement
    if (!wrapper || !layer) return
    const wr = wrapper.getBoundingClientRect()
    const rect = range ? [...(range.getClientRects?.() || [])].find((x) => x.height > 0) : null
    // שורה שגולשת לכמה שורות מסך — הפס החזק רק בשורת המסך של המילה (כמו ב-TextMirror)
    const lh = parseFloat(getComputedStyle(host).lineHeight)
    const lr = lineEl.getBoundingClientRect()
    if (band && rect && lh > 0 && lr.height > lh * 1.5) {
      const mid = (rect.top + rect.bottom) / 2
      Object.assign(band.style, {
        display: 'block',
        top: `${mid - lh / 2 - wr.top}px`,
        height: `${lh}px`,
        left: `${lr.left - wr.left}px`,
        width: `${lr.width}px`
      })
      lineEl.setAttribute('data-multi', '')
    }
    // בלי Custom Highlight — מלבנים מאחורי המילה
    if (!hasHl && fallback && range) {
      const hl = MIRROR_HIGHLIGHT[t.strength || 'strong'] || MIRROR_HIGHLIGHT.strong
      for (const x of range.getClientRects?.() || []) {
        if (!(x.height > 0)) continue
        const d = doc.createElement('div')
        Object.assign(d.style, {
          position: 'absolute',
          top: `${x.top - wr.top}px`,
          left: `${x.left - wr.left}px`,
          width: `${x.width}px`,
          height: `${x.height}px`,
          background: hl.word || 'transparent',
          borderRadius: '4px',
          borderBottom: `${hl.underline} ${t.estimated ? 'dashed' : 'solid'} var(--color-primary)`
        })
        fallback.appendChild(d)
      }
    }
  }
  const scheduleDecorations = () => {
    if (st.raf || typeof requestAnimationFrame === 'undefined') return
    st.raf = requestAnimationFrame(decorate)
  }

  // ---------- עימוד ספר: חלון בתחילת פסקה וסיום משולש (תצוגה בלבד) ----------
  const bookOpts = () => {
    const b = getProps().book
    if (!b || (!b.window && !b.funnel) || typeof getComputedStyle === 'undefined') return null
    const cs = getComputedStyle(host)
    const lh = parseFloat(cs.lineHeight)
    const fontPx = parseFloat(cs.fontSize)
    // שורה-מול-שורה (wrap off) — אין שבירת שורות, אין מה לעמד
    if (cs.whiteSpace === 'pre' || !(lh > 0) || !(fontPx > 0) || !(host.clientWidth > 0)) return null
    return { window: !!b.window, funnel: !!b.funnel, justify: cs.textAlign === 'justify', lh, fontPx, rtl: cs.direction === 'rtl', font: cs.fontFamily }
  }
  /**
   * עימוד השורות שעוד לא עומדו לפי החתימה הנוכחית (רוחב, גופן, יישור, העדפות).
   * maxSync — יותר שורות ממתינות מזה: לא עכשיו (מתוזמן ב-rAF, קודם השורות הנראות).
   * @returns {boolean} true — הכל עומד
   */
  const bookRun = (budgetMs, maxSync = Infinity) => {
    if (st.composing) return true
    const o = bookOpts()
    const sig = o ? [host.clientWidth, o.lh, o.fontPx, o.justify, o.window, o.funnel, o.rtl, o.font].join('|') : ''
    const lines = lineElements(host)
    if (!o) {
      if (st.bk.sig) {
        for (const el of lines) clearBookLine(el)
        host.removeAttribute('data-book')
        st.bk.sig = ''
        st.bk.plans = []
      }
      return true
    }
    if (sig !== st.bk.sig) {
      st.bk.sig = sig
      host.setAttribute('data-book', '')
    }
    const pending = []
    lines.forEach((el, i) => {
      if (/** @type {any} */ (el).__bk !== sig) pending.push(i)
    })
    if (!pending.length) return true
    if (pending.length > maxSync) {
      scheduleBook()
      return false
    }
    if (pending.length > 3) {
      const hr = host.getBoundingClientRect()
      const dist = (i) => {
        const r = lines[i].getBoundingClientRect()
        return r.bottom < hr.top ? hr.top - r.bottom : r.top > hr.bottom ? r.top - hr.bottom : 0
      }
      const d = new Map(pending.map((i) => [i, dist(i)]))
      pending.sort((a, b) => d.get(a) - d.get(b) || a - b)
    }
    const t0 = typeof performance === 'undefined' ? 0 : performance.now()
    for (const i of pending) {
      st.bk.plans[i] = layoutBookLine(lines[i], o, st.bk.plans[i] || null).plan
      Object.assign(lines[i], { __bk: sig })
      if (t0 && performance.now() - t0 > budgetMs) {
        scheduleBook()
        return false
      }
    }
    return true
  }
  const bookTick = () => {
    st.bk.raf = 0
    bookRun(10)
    scheduleDecorations()
  }
  function scheduleBook() {
    if (st.bk.raf || typeof requestAnimationFrame === 'undefined') return
    st.bk.raf = requestAnimationFrame(bookTick)
  }

  // ---------- הערך ----------
  const setRaw = (v, force = false) => {
    st.raw = v
    st.index = buildRichIndex(v)
    renderInto(host, st.index, force)
    // השורות שנבנו מחדש (בדרך כלל השורה שבעריכה) — מיד, לפני הציור ולפני קביעת הסמן; הרבה — ב-rAF
    bookRun(Infinity, 3)
    if (v === '') host.setAttribute('data-empty', '')
    else host.removeAttribute('data-empty')
    scheduleDecorations()
  }

  const emit = (inputType, data = null) => {
    entry.value = st.raw
    st.emitted.push(st.raw)
    // הורה שלא מחזיר ערכים (לא מבוקר) — לא לצבור בלי סוף
    if (st.emitted.length > 64) st.emitted.shift()
    getProps().onChange?.({ target: host, currentTarget: host, type: 'change' })
    if (typeof InputEvent === 'function') host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }))
  }

  const now = () => Date.now()

  /** עריכה: next — { value, caret }; kind — לקיבוץ בהיסטוריה */
  const commit = (next, inputType, kind, data = null) => {
    if (next.value === st.raw) {
      st.sel = { start: next.caret, end: next.caret, dir: 'none' }
      applySelection()
      return
    }
    st.history.record({ value: st.raw, start: st.sel.start, end: st.sel.end }, kind, now())
    setRaw(next.value)
    st.sel = { start: next.caret, end: next.caret, dir: 'none' }
    st.progSel = false
    applySelection()
    ensureVisible()
    emit(inputType, data)
  }

  const restore = (snap, inputType) => {
    setRaw(snap.value)
    st.sel = { start: snap.start, end: snap.end, dir: 'none' }
    applySelection()
    ensureVisible()
    emit(inputType)
  }
  const undo = () => {
    const snap = st.history.undo({ value: st.raw, start: st.sel.start, end: st.sel.end })
    if (!snap) return false
    // צעד מבני (ביטול איחוד טורים) — ההורה משחזר את המבנה, השדה הזה עומד להיעלם
    if (runStructural(entry, snap)) return true
    restore(snap, 'historyUndo')
    return true
  }
  const redo = () => {
    const prev = st.raw
    const snap = st.history.redo({ value: st.raw, start: st.sel.start, end: st.sel.end })
    if (!snap) return false
    // ביצוע מחדש: הסמן בסוף העריכה שחזרה (כמו ב-textarea), לא בבחירה שהייתה בזמן הביטול
    const caret = redoCaret(prev, snap.value)
    restore({ value: snap.value, start: caret, end: caret }, 'historyRedo')
    return true
  }

  // הדפדפן שינה את ה-DOM בעצמו (IME, תיקון אוטומטי) — מה השתנה בטקסט הנראה, ובחזרה למחרוזת
  const resyncFromDom = () => {
    const ix = st.index
    const cur = displayFromDom(host)
    const old = ix.display
    if (cur === old) {
      renderInto(host, ix, true)
      applySelection()
      return
    }
    let pre = 0
    while (pre < cur.length && pre < old.length && cur[pre] === old[pre]) pre++
    let suf = 0
    while (suf < cur.length - pre && suf < old.length - pre && cur[cur.length - 1 - suf] === old[old.length - 1 - suf]) suf++
    const inserted = cur.slice(pre, cur.length - suf)
    const removedEnd = old.length - suf
    let a
    let b
    if (removedEnd > pre) {
      a = displayWindow(ix, pre).hi
      b = displayWindow(ix, removedEnd).lo
    } else {
      const cs = st.compSel
      a = cs && rawToDisplay(ix, cs.start).d === pre ? cs.start : displayWindow(ix, pre).lo
      b = a
    }
    const next = replaceSelection(st.raw, a, b, inserted)
    st.history.record({ value: st.raw, start: st.sel.start, end: st.sel.end }, 'other', now())
    setRaw(next.value, true)
    st.sel = { start: next.caret, end: next.caret, dir: 'none' }
    applySelection()
    emit('insertText', inserted)
  }

  // ---------- ממשק תואם-textarea ----------
  const setSelectionRange = (a, b = a, d = 'none') => {
    const n = st.raw.length
    const s = Math.max(0, Math.min(n, Math.trunc(Number(a)) || 0))
    const e = Math.max(s, Math.min(n, Math.trunc(Number(b)) || 0))
    st.sel = { start: s, end: e, dir: d === 'backward' ? 'backward' : 'forward' }
    st.progSel = true
    st.history.breakGroup()
    applySelection()
    if (isFocused()) ensureVisible()
  }
  const api = {
    undo,
    redo,
    // עומק ההיסטוריה — לכפתורי הביטול/ביצוע מחדש (useUndoAvailability)
    canUndo: () => st.history.canUndo(),
    canRedo: () => st.history.canRedo(),
    /**
     * החלפה מדויקת של טווח בטקסט הגולמי (כולל תגים) — צעד ביטול אחד. execCommand('insertText') לא
     * מתאים כאן: כשהטקסט הנראה לא משתנה (הסרת <b> סביב מילה) הדפדפן לא שולח beforeinput כלל.
     */
    replaceRange: (from, to, text) => {
      const raw = st.raw
      const a = Math.max(0, Math.min(raw.length, Math.trunc(Number(from)) || 0))
      const b = Math.max(a, Math.min(raw.length, Math.trunc(Number(to)) || 0))
      const t = String(text ?? '')
      st.history.breakGroup()
      commit({ value: raw.slice(0, a) + t + raw.slice(b), caret: a + t.length }, 'insertReplacementText', 'other', t)
      st.history.breakGroup()
    },
    caretTop: (pos) => {
      const r = pointRect(host, st.index, pos)
      if (!r) return null
      const hr = host.getBoundingClientRect()
      return r.top - hr.top - host.clientTop + host.scrollTop
    },
    caretRowY: (pos) => {
      const r = pointRect(host, st.index, pos)
      return r && r.bottom > r.top ? (r.top + r.bottom) / 2 : null
    },
    offsetAtY: (y) => {
      const hr = host.getBoundingClientRect()
      if (!(y >= hr.top && y <= hr.bottom)) return null
      const x = hr.left + hr.width / 2
      let node = null
      let offset = 0
      const anyDoc = /** @type {any} */ (doc)
      const cp = anyDoc.caretPositionFromPoint?.(x, y)
      if (cp) [node, offset] = [cp.offsetNode, cp.offset]
      else {
        const cr = anyDoc.caretRangeFromPoint?.(x, y)
        if (cr) [node, offset] = [cr.startContainer, cr.startOffset]
      }
      return rawFromDomPoint(host, st.index, node, offset)
    },
    lineMidY: (line) => {
      const el = lineElements(host)[line]
      if (!el) return null
      const r = el.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(host).lineHeight) || r.height
      return r.top + Math.min(r.height, lh) / 2
    }
  }
  Object.defineProperties(host, {
    value: {
      configurable: true,
      get: () => st.raw,
      set: (v) => {
        setRaw(String(v ?? ''))
        st.history.clear()
        entry.value = st.raw
      }
    },
    selectionStart: { configurable: true, get: () => readSelection().start, set: (v) => setSelectionRange(v, Math.max(v, st.sel.end)) },
    selectionEnd: { configurable: true, get: () => readSelection().end, set: (v) => setSelectionRange(Math.min(v, st.sel.start), v) },
    selectionDirection: { configurable: true, get: () => readSelection().dir },
    setSelectionRange: { configurable: true, value: setSelectionRange },
    select: { configurable: true, value: () => setSelectionRange(0, st.raw.length) },
    __richTextarea: { configurable: true, value: api }
  })

  // ---------- אירועים ----------
  const textFromEvent = (e) => e.data ?? e.dataTransfer?.getData('text/plain') ?? ''
  const onBeforeInput = (e) => {
    const t = e.inputType
    if (t === 'insertCompositionText') return
    e.preventDefault()
    if (st.composing) return
    const { start, end } = readSelection()
    const raw = st.raw
    switch (t) {
      case 'insertText':
      case 'insertReplacementText':
      case 'insertFromYank':
      case 'insertFromDrop':
      case 'insertFromPaste':
      case 'insertFromPasteAsQuotation': {
        const text = String(textFromEvent(e)).replace(/\r\n?/g, '\n')
        // תמיד החלפה ששומרת על התגים שבבחירה — גם כשהבחירה נקבעה בקוד (למשל אחרי כפתור עיצוב
        // שבחר מאמצע <b> עד אחריו): החלפה מדויקת של הגולמי הייתה מוחקת חצי זוג ומשאירה <b> פתוח.
        // שינויים תוכנתיים מדויקים עוברים ב-replaceRange (applyFieldEdit), לא ב-beforeinput.
        const typed = SINGLE_GRAPHEME.test(text) && !st.progSel
        const next = replaceSelection(raw, start, end, text)
        const kind = typed && start === end && !/\s/.test(text) ? 'type' : 'other'
        if (kind !== 'type') st.history.breakGroup()
        commit(next, 'insertText', kind, text)
        if (/\s/.test(text)) st.history.breakGroup()
        return
      }
      case 'insertParagraph':
      case 'insertLineBreak':
        st.history.breakGroup()
        commit(insertLineBreak(raw, start, end), t, 'other')
        return
      case 'deleteContentBackward':
      case 'deleteContentForward':
      case 'deleteWordBackward':
      case 'deleteWordForward': {
        const forward = t.endsWith('Forward')
        const word = t.startsWith('deleteWord')
        commit(deleteAt(raw, start, end, { forward, word }), t, start === end && !word ? 'del' : 'other')
        return
      }
      case 'deleteSoftLineBackward':
      case 'deleteHardLineBackward': {
        const ls = raw.lastIndexOf('\n', start - 1) + 1
        commit(replaceSelection(raw, start === end ? ls : start, end, ''), t, 'other')
        return
      }
      case 'deleteSoftLineForward':
      case 'deleteHardLineForward': {
        let le = raw.indexOf('\n', end)
        if (le < 0) le = raw.length
        commit(replaceSelection(raw, start, start === end ? le : end, ''), t, 'other')
        return
      }
      case 'deleteByCut':
      case 'deleteByDrag':
      case 'deleteContent':
        commit(replaceSelection(raw, start, end, ''), t, 'other')
        return
      case 'historyUndo':
        undo()
        return
      case 'historyRedo':
        redo()
        return
      default:
        // עיצוב מובנה (formatBold...) ושאר פעולות הדפדפן — לא משנים את ה-DOM
    }
  }
  const onInput = (e) => {
    if (!e.isTrusted || st.composing) return
    resyncFromDom()
  }
  const onCompStart = () => {
    st.compSel = readSelection()
    st.composing = true
  }
  const onCompEnd = () => {
    st.composing = false
    resyncFromDom()
    st.compSel = null
  }
  const onKeyDown = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const z = e.code === 'KeyZ' || e.key.toLowerCase() === 'z'
    const y = e.code === 'KeyY' || e.key.toLowerCase() === 'y'
    if (z && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (y || (z && e.shiftKey)) {
      e.preventDefault()
      redo()
    }
  }
  // העתקה = המחרוזת השמורה של הבחירה (עם התגים) — הדבקה בחזרה משחזרת את העיצוב
  const copyOut = (e, cut) => {
    const { start, end } = readSelection()
    if (start === end || !e.clipboardData) return
    e.preventDefault()
    const text = st.raw.slice(start, end)
    e.clipboardData.setData('text/plain', text)
    e.clipboardData.setData('text/html', text.replace(/\n/g, '<br>'))
    if (cut) commit(replaceSelection(st.raw, start, end, ''), 'deleteByCut', 'other')
  }
  const onCopy = (e) => copyOut(e, false)
  const onCut = (e) => copyOut(e, true)
  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    const { start, end } = readSelection()
    st.history.breakGroup()
    commit(replaceSelection(st.raw, start, end, text), 'insertFromPaste', 'other', text)
  }
  const prevent = (e) => e.preventDefault()
  const onPointerDown = () => {
    st.pointer = true
    st.history.breakGroup()
  }
  const onPointerUp = () => {
    st.pointer = false
  }
  const onFocus = () => {
    // מיקוד מקוד (focus()) — הבחירה השמורה; מיקוד בלחיצה — המקום שנלחץ
    if (!st.pointer) applySelection()
  }
  const onSelChange = () => {
    if (!isFocused() || st.composing) return
    const prev = st.sel
    const next = readSelection()
    if (next.start !== prev.start || next.end !== prev.end) st.history.breakGroup()
  }

  const listeners = [
    ['beforeinput', onBeforeInput],
    ['input', onInput],
    ['compositionstart', onCompStart],
    ['compositionend', onCompEnd],
    ['keydown', onKeyDown],
    ['copy', onCopy],
    ['cut', onCut],
    ['paste', onPaste],
    ['dragstart', prevent],
    ['drop', prevent],
    ['pointerdown', onPointerDown],
    ['focus', onFocus],
    ['scroll', scheduleDecorations]
  ]
  for (const [name, fn] of listeners) host.addEventListener(name, fn)
  doc.addEventListener('pointerup', onPointerUp, true)
  doc.addEventListener('selectionchange', onSelChange)
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    scheduleBook()
    scheduleDecorations()
  })
  ro?.observe(host)
  setRaw('', true)

  return {
    api,
    scheduleDecorations,
    /** בדיקה אם העדפות העימוד/הגופן/היישור השתנו — עימוד מחדש ב-rAF (זול כשלא השתנה דבר) */
    checkBook: scheduleBook,
    /** ערך מה-props: הד של עריכה שלנו — מאשרים ומתעלמים; ערך חדש מבחוץ (טעינה, פיצול, החלפה) — מחליפים */
    syncValue(value) {
      const v = String(value ?? '')
      // ההורה מסונכרן עם המצב הנוכחי — כל מה ששלחנו עד עכשיו אושר
      if (v === st.raw) {
        st.emitted = []
        syncFieldValue(entry, v)
        return
      }
      // הד ביניים (עריכה שכבר אחריה באו עוד): ההדים חוזרים לפי הסדר — מאשרים עד המוקדם שמתאים
      const echo = st.emitted.indexOf(v)
      if (echo >= 0) {
        st.emitted.splice(0, echo + 1)
        return
      }
      st.emitted = []
      setRaw(v, true)
      // ערך שונה ממה שהשדה הלוגי ידוע בו — עריכה מבחוץ, המחסנית מתאפסת; זהה — שדה חדש של אותו
      // ערך (מעבר תצוגה): ממשיכים
      syncFieldValue(entry, v)
      st.sel = { start: Math.min(st.sel.start, v.length), end: Math.min(st.sel.end, v.length), dir: 'none' }
      applySelection()
    },
    destroy() {
      for (const [name, fn] of listeners) host.removeEventListener(name, fn)
      doc.removeEventListener('pointerup', onPointerUp, true)
      doc.removeEventListener('selectionchange', onSelChange)
      ro?.disconnect()
      if (st.raf) cancelAnimationFrame(st.raf)
      st.raf = 0
      if (st.bk.raf) cancelAnimationFrame(st.bk.raf)
      st.bk.raf = 0
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        for (const k of ['word', 'wordest', 'sus']) CSS.highlights.delete(highlightName(k, column))
      }
      for (const k of ['value', 'selectionStart', 'selectionEnd', 'selectionDirection', 'setSelectionRange', 'select', '__richTextarea']) {
        delete /** @type {any} */ (host)[k]
      }
    }
  }
}

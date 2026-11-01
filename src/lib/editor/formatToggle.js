// הפעלה/ביטול של עיצוב (תגי HTML) בטקסט הגולמי של העמוד — לוגיקה טהורה (formatToggle.test.mjs).
// משמשת את שתי התצוגות (textarea בקוד, והשדה המעוצב — שניהם חושפים value + selectionStart/End),
// ו-page.jsx מחיל את התוצאה כהחלפה אחת (צעד ביטול אחד).
//
// toggleFormat — לחיצה על B/I/U/big/small: אם כל הטקסט שבבחירה (או המילה שתחת הסמן) כבר בתוך
//   התג — התג מוסר (גם מחלק מריצה: הריצה מתפצלת); אחרת — עוטפים. A+ על טקסט ב-<small> מסיר את
//   ה-<small> (חזרה לרגיל) ולא מקנן <big> בתוכו; וכן A− על <big>. כותרות (h1–h3) — לשורה כולה.
// clearFormatting — "נקה עיצוב": מסיר את כל תגי העיצוב (b,i,u,big,small,strong,em) מהבחירה,
//   ושורת כותרת חוזרת לפסקה רגילה. תגים אחרים (span, img, a...) לא נוגעים בהם לעולם.
// activeFormats — אילו עיצובים חלים על הבחירה/הסמן (למצב "לחוץ" של הכפתורים).
//
// toggleFormat / clearFormatting מחזירות { value, start, end } — הטקסט החדש והבחירה החדשה (התוכן,
// בלי התגים שנוספו); בלי בחירה — הסמן נשאר במקומו בתוך המילה.

/** תגי העיצוב שמנוהלים כאן (נקה עיצוב מסיר את כולם) */
export const INLINE_FORMAT_TAGS = Object.freeze(['b', 'i', 'u', 'big', 'small', 'strong', 'em'])
export const HEADING_TAGS = Object.freeze(['h1', 'h2', 'h3'])

/** תג → כל השמות שנחשבים לאותו עיצוב (strong = מודגש, em = נטוי) */
const ALIASES = { b: ['b', 'strong'], i: ['i', 'em'], u: ['u'], big: ['big'], small: ['small'] }
/** A+ על <small> מחזיר לרגיל, A− על <big> — כנ"ל */
const OPPOSITE = { big: 'small', small: 'big' }
const VOID_TAGS = new Set(['img', 'br', 'hr', 'wbr', 'input', 'meta', 'link', 'source', 'area', 'col', 'embed', 'param', 'track'])

// סמנים זמניים (תווים לשימוש פרטי) לבחירה ולסמן — עוברים עם הטקסט דרך העריכות ומוסרים בסוף
const MARK_S = '\uE000'
const MARK_E = '\uE001'
const MARK_C = '\uE002'

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/g
const isWs = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u00a0'

/**
 * פירוק לתגים ולאלמנטים (זוגות פתיחה/סגירה תקינים). owner[i] — מספר התג שהתו i בתוכו, או -1.
 * @param {string} raw
 */
export function parseMarkup(raw) {
  const tags = []
  const owner = new Int32Array(raw.length).fill(-1)
  TAG_RE.lastIndex = 0
  let m
  while ((m = TAG_RE.exec(raw))) {
    const name = m[2].toLowerCase()
    const tag = { start: m.index, end: m.index + m[0].length, name, closing: m[1] === '/', text: m[0], self: /\/>$/.test(m[0]) || VOID_TAGS.has(name) }
    for (let k = tag.start; k < tag.end; k++) owner[k] = tags.length
    tags.push(tag)
  }
  const elements = []
  const stack = []
  for (const tag of tags) {
    if (tag.self && !tag.closing) continue
    if (!tag.closing) {
      stack.push(tag)
      continue
    }
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].name === tag.name) {
        elements.push({ name: tag.name, open: stack[k], close: tag })
        stack.length = k
        break
      }
    }
  }
  elements.sort((a, b) => a.open.start - b.open.start)
  return { tags, owner, elements }
}

const isText = (doc, i) => doc.owner[i] < 0
const tagAt = (doc, i) => (i >= 0 && i < doc.owner.length && doc.owner[i] >= 0 ? doc.tags[doc.owner[i]] : null)

/** מיקום שנפל באמצע תג — לקצה התג (toEnd: לסופו; אחרת לתחילתו) */
function outOfTag(doc, p, toEnd) {
  const t = tagAt(doc, p)
  if (!t || t.start === p) return p
  return toEnd ? t.end : t.start
}

/** קיצוץ רווחים ותגים בקצוות הטווח — התוכן עצמו */
function trimRange(doc, raw, s, e) {
  for (;;) {
    const t = tagAt(doc, s)
    if (s < e && !t && isWs(raw[s])) s++
    else if (s < e && t && t.start === s && t.end <= e) s = t.end
    else break
  }
  for (;;) {
    const t = tagAt(doc, e - 1)
    if (e > s && !t && isWs(raw[e - 1])) e--
    else if (e > s && t && t.end === e && t.start >= s) e = t.start
    else break
  }
  return [s, Math.max(s, e)]
}

/** המילה שתחת הסמן (תגים שקופים — לא שוברים מילה); [p, p] אם אין */
function wordAt(doc, raw, p) {
  let s = p
  while (s > 0) {
    const t = tagAt(doc, s - 1)
    if (t) s = t.start
    else if (!isWs(raw[s - 1])) s--
    else break
  }
  let e = p
  while (e < raw.length) {
    const t = tagAt(doc, e)
    if (t) e = t.end
    else if (!isWs(raw[e])) e++
    else break
  }
  const [ts, te] = trimRange(doc, raw, s, e)
  return ts < te ? [ts, te] : [p, p]
}

/** תווי הטקסט (לא רווח) בטווח */
function textChars(doc, raw, s, e) {
  const out = []
  for (let i = s; i < e; i++) if (isText(doc, i) && !isWs(raw[i])) out.push(i)
  return out
}

/** האם i בתוך תוכן האלמנט */
const inside = (el, i) => el.open.end <= i && i < el.close.start

/** הטווח שהפעולה חלה עליו: הבחירה (מקוצצת), ובסמן — המילה שתחתיו */
function targetRange(doc, raw, lo, hi) {
  const s = outOfTag(doc, lo, true)
  const e = Math.max(s, outOfTag(doc, hi, false))
  if (s === e) return wordAt(doc, raw, s)
  return trimRange(doc, raw, s, e)
}

/** האם כל תווי הטקסט בטווח בתוך אחד מהשמות (בטווח ריק — הסמן בתוך אלמנט כזה) */
function covered(doc, raw, s, e, names) {
  const els = doc.elements.filter((el) => names.includes(el.name))
  if (!els.length) return false
  const chars = textChars(doc, raw, s, e)
  if (!chars.length) return els.some((el) => el.open.end <= s && s <= el.close.start)
  return chars.every((i) => els.some((el) => inside(el, i)))
}

/** האם תו טקסט כלשהו בטווח בתוך אחד מהשמות (בטווח ריק — הסמן בתוך אלמנט כזה) */
function touched(doc, raw, s, e, names) {
  const els = doc.elements.filter((el) => names.includes(el.name))
  if (!els.length) return false
  const chars = textChars(doc, raw, s, e)
  if (!chars.length) return els.some((el) => el.open.end <= s && s <= el.close.start)
  return chars.some((i) => els.some((el) => inside(el, i)))
}

// ---------- עריכות ----------

/** מחיל עריכות { at, del?, ins?, order } על raw; עריכות באותו מקום — לפי order */
function applyEdits(raw, edits) {
  const sorted = [...edits].sort((a, b) => a.at - b.at || a.order - b.order)
  let out = ''
  let cursor = 0
  const inserted = []
  for (const ed of sorted) {
    if (ed.at > cursor) out += raw.slice(cursor, ed.at)
    if (ed.ins) {
      inserted.push([out.length, out.length + ed.ins.length])
      out += ed.ins
    }
    cursor = Math.max(cursor, ed.at + (ed.del || 0))
  }
  return { out: out + raw.slice(cursor), inserted }
}

/**
 * מסיר זוגות ריקים (<b></b>, גם כשרק סמנים ביניהם) שנוצרו מהעריכות. רק באזור העריכה — זוג ריק
 * שהיה בטקסט במקום אחר לא נוגעים בו.
 */
function dropEmptyPairs(text, inserted) {
  if (!inserted.length) return text
  // רק שמות של תגים שהוכנסו עכשיו (תג לא מוכר שהיה ריק מלכתחילה — לא נוגעים בו)
  const names = new Set()
  for (const [x, y] of inserted) for (const m of text.slice(x, y).matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)) names.add(m[1].toLowerCase())
  const lo = Math.min(...inserted.map((r) => r[0]))
  let hi = Math.max(...inserted.map((r) => r[1]))
  const re = /<([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>([\uE000-\uE002]*)<\/\1>/g
  let cur = text
  for (let removed = 1; removed > 0;) {
    removed = 0
    cur = cur.replace(re, (all, name, marks, offset) => {
      // רק זוג שנוגע באזור שבין ההכנסה הראשונה לאחרונה
      if (!(offset < hi && offset + all.length > lo) || !names.has(name.toLowerCase())) return all
      removed += all.length - marks.length
      return marks
    })
    hi -= removed
  }
  return cur
}

/** הוצאת הסמנים: { value, s, e, c } (c — מיקום הסמן, אם סומן) */
function extract(text) {
  const pos = {}
  let value = ''
  for (const ch of text) {
    if (ch === MARK_S || ch === MARK_E || ch === MARK_C) pos[ch] = value.length
    else value += ch
  }
  const s = pos[MARK_S] ?? pos[MARK_C] ?? 0
  const e = Math.max(s, pos[MARK_E] ?? s)
  return { value, s, e, c: pos[MARK_C] ?? null }
}

/** סמני הבחירה כעריכות: בתחילה — אחרי מה שמוכנס שם; בסוף — לפני; הסמן — אחרי הכול */
function markEdits({ s, e, c }) {
  const out = [{ at: s, ins: MARK_S, order: 1 }, { at: e, ins: MARK_E, order: -1 }]
  if (c != null) out.push({ at: c, ins: MARK_C, order: 2 })
  return out
}

/** אלמנטים שפתוחים בנקודה p ונמצאים בתוך התחום [lo, hi) — מהחיצוני לפנימי */
function openAcross(doc, p, lo, hi) {
  return doc.elements.filter((el) => el.open.start >= lo && el.close.end <= hi && el.open.end <= p && p <= el.close.start)
}

/** סגירה ופתיחה מחדש של אלמנטים סביב תג שמוכנס בנקודה (כדי שהקינון יישאר תקין) */
const around = (inner, tagText) =>
  inner.slice().reverse().map((el) => `</${el.name}>`).join('') + tagText + inner.map((el) => el.open.text).join('')

/** האם יש בטווח תוכן — טקסט (לא רווח) או תג בודד (תמונה) */
function hasContent(doc, raw, a, b) {
  if (textChars(doc, raw, a, b).length) return true
  return doc.tags.some((t) => t.self && t.start >= a && t.end <= b)
}

/** הסרת השמות names מהטווח sel.s–sel.e — האלמנטים שנחתכים מתפצלים */
function unwrapRange(raw, sel, names) {
  const doc = parseMarkup(raw)
  const { s, e } = sel
  const edits = markEdits(sel)
  // טווח של רווחים בלבד (בלי טקסט או תמונה) — אין מה להסיר; פיצול האלמנטים סביבו רק היה
  // מוסיף "</b><b>" (ו"נקה עיצוב" שני היה משנה שוב). סמן בלי בחירה (s === e) כן מפצל — כך
  // מכבים עיצוב כדי להקליד בלעדיו.
  if (s < e && !hasContent(doc, raw, s, e)) return extract(applyEdits(raw, edits).out)
  const chars = textChars(doc, raw, s, e)
  const els = doc.elements.filter((el) => names.includes(el.name) && (chars.length
    ? chars.some((i) => inside(el, i))
    : el.open.end <= s && s <= el.close.start))
  for (const el of els) {
    if (hasContent(doc, raw, el.open.end, s)) edits.push({ at: s, ins: around(openAcross(doc, s, el.open.end, el.close.start), `</${el.name}>`), order: 0 })
    else edits.push({ at: el.open.start, del: el.open.end - el.open.start, order: 0 })
    if (hasContent(doc, raw, e, el.close.start)) edits.push({ at: e, ins: around(openAcross(doc, e, el.open.end, el.close.start), el.open.text), order: 0 })
    else edits.push({ at: el.close.start, del: el.close.end - el.close.start, order: 0 })
  }
  const { out, inserted } = applyEdits(raw, edits)
  return extract(dropEmptyPairs(out, inserted))
}

/** עטיפת sel.s–sel.e ב-<tag> — לכל שורה בנפרד; אלמנטים שחוצים את הקצוות נסגרים ונפתחים מחדש */
function wrapRange(raw, sel, tag) {
  const { s, e } = sel
  if (s === e) return extract(raw.slice(0, s) + `<${tag}>` + MARK_C + `</${tag}>` + raw.slice(s))
  const doc = parseMarkup(raw)
  const edits = markEdits(sel)
  let lineStart = s
  while (lineStart < e) {
    let lineEnd = raw.indexOf('\n', lineStart)
    if (lineEnd < 0 || lineEnd > e) lineEnd = e
    const [a, b] = trimRange(doc, raw, lineStart, lineEnd)
    if (a < b && textChars(doc, raw, a, b).length) {
      // נפתח לפני a ונסגר בתוך הקטע: נסגר לפני <tag> ונפתח מחדש בתוכו
      const crossIn = doc.elements.filter((el) => el.open.end <= a && el.close.start > a && el.close.start < b)
      // נפתח בתוך הקטע ונסגר ב-b או אחריו: נסגר לפני </tag> ונפתח מחדש אחריו
      const crossOut = doc.elements.filter((el) => el.open.start >= a && el.open.start < b && el.close.start >= b)
      edits.push({ at: a, ins: around(crossIn, `<${tag}>`), order: 0 })
      edits.push({ at: b, ins: around(crossOut, `</${tag}>`), order: 0 })
    }
    lineStart = lineEnd + 1
  }
  const { out, inserted } = applyEdits(raw, edits)
  return extract(dropEmptyPairs(out, inserted))
}

// ---------- כותרות (לשורה כולה) ----------

/** טווחי השורות שהבחירה נוגעת בהן (בחירה שמסתיימת בתחילת שורה — לא כוללת אותה) */
function linesOf(raw, start, end) {
  const last = end > start && raw[end - 1] === '\n' ? end - 1 : end
  const out = []
  let ls = raw.lastIndexOf('\n', start - 1) + 1
  for (;;) {
    let le = raw.indexOf('\n', ls)
    if (le < 0) le = raw.length
    out.push([ls, le])
    if (le >= last || le >= raw.length) break
    ls = le + 1
  }
  return out
}

/** קיצוץ רווחים בלבד (לא תגים) */
function wsTrim(raw, a, b) {
  while (a < b && isWs(raw[a])) a++
  while (b > a && isWs(raw[b - 1])) b--
  return [a, b]
}

/** אלמנט כותרת שעוטף את כל הטקסט שבשורה, אם יש */
function lineHeading(doc, raw, ls, le) {
  return doc.elements.find((el) => HEADING_TAGS.includes(el.name) && el.open.start >= ls && el.close.end <= le &&
    !textChars(doc, raw, ls, el.open.start).length && !textChars(doc, raw, el.close.end, le).length) || null
}

/** שורה בלי תוכן (ריקה / רווחים / תגים ריקים) — כותרת לא חלה עליה */
function isBlankLine(doc, raw, ls, le) {
  const [a, b] = wsTrim(raw, ls, le)
  return a >= b || !hasContent(doc, raw, a, b)
}

/** level: 'h1'..'h3' — החלה (או הסרה, אם כל השורות כבר ברמה הזו); null — הסרת כל כותרת.
 *  שורות ריקות שבבחירה מדולגות (אחרת נוצר בהן "</h2><h2>" הפוך) ולא נספרות בבדיקת "כולן כבר ברמה". */
function setHeading(raw, sel, level) {
  const doc = parseMarkup(raw)
  const edits = markEdits(sel)
  const lines = linesOf(raw, sel.s, sel.e)
  const current = lines.map(([ls, le]) => lineHeading(doc, raw, ls, le))
  const blank = lines.map(([ls, le], k) => !current[k] && isBlankLine(doc, raw, ls, le))
  const filled = current.filter((h, k) => !blank[k])
  const removeAll = level == null || (filled.length > 0 && filled.every((h) => h && h.name === level))
  lines.forEach(([ls, le], k) => {
    const h = current[k]
    if (blank[k]) {
      // סמן (בלי בחירה) על שורה ריקה לגמרי: כותרת ריקה והסמן בתוכה — להקליד כותרת חדשה
      if (!removeAll && lines.length === 1 && sel.c != null && ls === le) {
        edits.push({ at: ls, ins: `<${level}>`, order: 0.5 })
        edits.push({ at: ls, ins: `</${level}>`, order: 3 })
      }
      return
    }
    if (h) {
      edits.push({ at: h.open.start, del: h.open.end - h.open.start, order: 0 })
      edits.push({ at: h.close.start, del: h.close.end - h.close.start, order: 0 })
    }
    if (removeAll) return
    // השורה כולה, כולל תגי העיצוב שבקצוות (רק רווחים נשארים בחוץ) — הכותרת עוטפת אותם, והקינון תקין
    let [a, b] = h ? [h.open.start, h.close.start] : wsTrim(raw, ls, le)
    if (!h) {
      // תג סוגר בתחילת השורה של אלמנט שנפתח בשורה קודמת (ותג פותח בסופה של אלמנט שנסגר אחריה)
      // — נשאר מחוץ לכותרת, אחרת "<h1></b>…</h1>"
      for (let moved = true; moved;) {
        moved = false
        const el = doc.elements.find((x) => x.close.start === a && x.open.start < ls)
        if (el) [a, moved] = [wsTrim(raw, el.close.end, b)[0], true]
        const el2 = doc.elements.find((x) => x.open.end === b && x.close.start >= le)
        if (el2) [b, moved] = [wsTrim(raw, a, el2.open.start)[1], true]
      }
    }
    // אלמנט שחוצה את גבול השורה (למשל <big> על כמה שורות) נסגר ונפתח מחדש סביב תג הכותרת,
    // כמו בעטיפה רגילה — אחרת הקינון נשבר (<h1><big>…</h1>…</big>)
    const crossIn = h ? [] : doc.elements.filter((el) => el.open.end <= a && el.close.start > a && el.close.start < b)
    const crossOut = h ? [] : doc.elements.filter((el) => el.open.start >= a && el.open.start < b && el.close.start >= b)
    edits.push({ at: a, ins: around(crossIn, `<${level}>`), order: 0.5 })
    edits.push({ at: b, ins: around(crossOut, `</${level}>`), order: -0.5 })
  })
  return extract(applyEdits(raw, edits).out)
}

// ---------- ממשק ----------

/** התוצאה הציבורית: בלי בחירה — הסמן; אחרת — הבחירה */
const result = (r, collapsed) => (collapsed && r.c != null
  ? { value: r.value, start: r.c, end: r.c }
  : { value: r.value, start: r.s, end: r.e })

/** מצב ההתחלה: הטווח שהפעולה חלה עליו + הסמן (כשאין בחירה) */
function initialSel(doc, raw, lo, hi) {
  const [s, e] = targetRange(doc, raw, lo, hi)
  const c = lo === hi ? Math.min(Math.max(outOfTag(doc, lo, true), s), e) : null
  return { s, e, c }
}

/**
 * לחיצה על כפתור עיצוב: הסרה אם הכול כבר בעיצוב הזה, אחרת עטיפה.
 * @param {string} raw
 * @param {number} start
 * @param {number} end
 * @param {string} tag 'b'|'i'|'u'|'big'|'small'|'strong'|'em'|'h1'|'h2'|'h3'
 * @returns {{ value: string, start: number, end: number }}
 */
export function toggleFormat(raw, start, end, tag) {
  const text = String(raw ?? '')
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  const collapsed = lo === hi
  const name = tag === 'strong' ? 'b' : tag === 'em' ? 'i' : tag
  if (HEADING_TAGS.includes(name)) return result(setHeading(text, { s: lo, e: hi, c: collapsed ? lo : null }, name), collapsed)
  const names = ALIASES[name] || [name]
  const doc = parseMarkup(text)
  // בחירה של רווחים בלבד — אין מה לעצב או להסיר (אחרת התגים סביבה מתפצלים לחינם)
  if (!collapsed && !hasContent(doc, text, lo, hi)) return { value: text, start, end }
  const sel = initialSel(doc, text, lo, hi)
  // סמן בתוך אלמנט בעיצוב הזה: "המילה" נחתכת לגבולות האלמנט — אחרת מילה שממשיכה אחריו
  // (למשל "<small>גד</small>.") לא "מכוסה", והלחיצה עוטפת שוב במקום להסיר
  if (collapsed) {
    const own = doc.elements.filter((el) => names.includes(el.name) && el.open.end <= lo && lo <= el.close.start).pop()
    if (own) {
      const s = Math.max(sel.s, own.open.end)
      const e = Math.min(sel.e, own.close.start)
      if (s < e) Object.assign(sel, { s, e, c: Math.min(Math.max(sel.c ?? s, s), e) })
    }
  }
  const opposite = OPPOSITE[name]
  if (opposite && touched(doc, text, sel.s, sel.e, [opposite])) return result(unwrapRange(text, sel, [opposite]), collapsed)
  if (covered(doc, text, sel.s, sel.e, names)) return result(unwrapRange(text, sel, names), collapsed)
  // עטיפה: קודם מסירים את מה שכבר מעוצב בחלק מהבחירה (בלי <b><b>), ואז עוטפים
  const cur = touched(doc, text, sel.s, sel.e, names) ? unwrapRange(text, sel, names) : { value: text, ...sel }
  return result(wrapRange(cur.value, cur, names[0]), collapsed)
}

/**
 * "נקה עיצוב": מסיר את תגי העיצוב מהבחירה (או מהמילה שתחת הסמן), ושורות כותרת — לפסקה רגילה.
 * @returns {{ value: string, start: number, end: number }}
 */
export function clearFormatting(raw, start, end) {
  const text = String(raw ?? '')
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  const collapsed = lo === hi
  // בחירה של רווחים בלבד — אין עיצוב להסיר; בלי זה התגים סביבה היו מתפצלים ("</b><b>")
  if (!collapsed && !hasContent(parseMarkup(text), text, lo, hi)) return { value: text, start, end }
  const head = setHeading(text, { s: lo, e: hi, c: collapsed ? lo : null }, null)
  const doc = parseMarkup(head.value)
  let cur = { value: head.value, ...initialSel(doc, head.value, head.s, collapsed ? head.s : head.e) }
  // שם אחרי שם (כל מעבר מפרק מחדש) — כך הקינון נשאר תקין גם כשכמה עיצובים מקוננים
  for (const name of INLINE_FORMAT_TAGS) {
    if (touched(parseMarkup(cur.value), cur.value, cur.s, cur.e, [name])) cur = unwrapRange(cur.value, cur, [name])
  }
  // בלי שינוי — הבחירה נשארת כמו שהייתה
  if (cur.value === text) return { value: text, start, end }
  return result(cur, collapsed)
}

/**
 * אילו עיצובים חלים על הבחירה (כל הטקסט שבה) או על הסמן — למצב "לחוץ" של הכפתורים.
 * @returns {{ b: boolean, i: boolean, u: boolean, big: boolean, small: boolean, h1: boolean, h2: boolean, h3: boolean }}
 */
export function activeFormats(raw, start, end) {
  const text = String(raw ?? '')
  const doc = parseMarkup(text)
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  const s = outOfTag(doc, lo, true)
  const [a, b] = lo === hi ? [s, s] : trimRange(doc, text, s, Math.max(s, outOfTag(doc, hi, false)))
  const out = {}
  for (const name of ['b', 'i', 'u', 'big', 'small']) out[name] = covered(doc, text, a, b, ALIASES[name])
  const all = linesOf(text, lo, hi).map(([ls, le]) => {
    const h = lineHeading(doc, text, ls, le)
    return { name: h?.name ?? null, blank: !h && isBlankLine(doc, text, ls, le) }
  })
  // שורות ריקות בבחירה לא מבטלות "לחוץ" (כמו ב-setHeading); בחירה שכולה ריקה — לא לחוץ
  const heads = all.filter((x) => !x.blank).map((x) => x.name)
  for (const h of HEADING_TAGS) out[h] = heads.length > 0 && heads.every((x) => x === h)
  return out
}

/**
 * הטווח שהשתנה בין שני טקסטים — להחלה כהחלפה אחת (צעד ביטול אחד): מחליפים את before[from, to)
 * ב-text. text לא ריק לעולם (השדה המעוצב מוחק מחיקה ריקה "בשמירת תגים" — לא החלפה מדויקת), ולכן
 * כשהשינוי הוא מחיקה בלבד — הטווח מורחב בתו אחד.
 * @returns {{ from: number, to: number, text: string } | null} null — אין שינוי
 */
export function changedRange(before, after) {
  if (before === after) return null
  let pre = 0
  const max = Math.min(before.length, after.length)
  while (pre < max && before[pre] === after[pre]) pre++
  let suf = 0
  while (suf < max - pre && before[before.length - 1 - suf] === after[after.length - 1 - suf]) suf++
  let from = pre
  let to = before.length - suf
  let text = after.slice(pre, after.length - suf)
  if (!text) {
    if (from > 0) {
      from--
      text = before[from]
    } else {
      text = before[to]
      to++
    }
  }
  return { from, to, text }
}

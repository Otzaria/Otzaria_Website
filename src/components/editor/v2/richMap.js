// מודל התצוגה המעוצבת של עורך העמוד (RichTextArea) — לוגיקה טהורה, בלי DOM (richMap.test.js).
//
// המחרוזת השמורה לא משתנה: אותה תת-קבוצה של HTML, '\n' בין שורות. כאן היא מפורקת לאסימונים
// (טקסט / תג / ישות / '\n') עם ההיסטים שלהם במחרוזת ("raw"), וכל תו טקסט מקבל היסט "תצוגה"
// (display) — הטקסט כפי שהוא נראה, בלי התגים. תגים וישויות הם "אטומים": אורך התצוגה שלהם 0
// (תגים מוכרים מוסתרים לגמרי; תגים לא מוכרים וישויות מוצגים כ"שבב" שהתווית שלו ב-CSS בלבד, כך
// שגם להם אין טקסט ב-DOM). serialize(tokenize(s)) === s לכל מחרוזת — האסימונים מכסים אותה ברצף.

/** תגים מוכרים → מחלקת העיצוב שלהם (התג עצמו מוסתר; הטקסט שבתוכו מעוצב) */
export const KNOWN_TAGS = Object.freeze({
  b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's',
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4',
  big: 'big', small: 'small', sup: 'sup', sub: 'sub'
})

/** תגים בלי תג סוגר */
export const VOID_TAGS = new Set(['img', 'br', 'hr'])

// שם התג, ואחריו רווח/טאב (תכונות) או '>' מיד
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?=[ \t>])([^<>\n]*)>/y
const ENTITY_RE = /&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/y

const NAMED_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * @typedef {{ kind: 'text'|'nl'|'tag'|'entity', start: number, end: number, raw: string,
 *   name?: string, closing?: boolean, known?: boolean }} RichToken
 */

/**
 * המחרוזת → אסימונים רצופים. תג = <שם ...> או </שם> בלי '<'/'>'/'\n' באמצע; '<' שאינו תג הוא טקסט.
 * @param {string} raw
 * @returns {RichToken[]}
 */
export function tokenize(raw) {
  const s = String(raw ?? '')
  const out = []
  let textStart = 0
  const flushText = (end) => {
    if (end > textStart) out.push({ kind: 'text', start: textStart, end, raw: s.slice(textStart, end) })
  }
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\n') {
      flushText(i)
      out.push({ kind: 'nl', start: i, end: i + 1, raw: '\n' })
      textStart = ++i
      continue
    }
    if (c === '<') {
      TAG_RE.lastIndex = i
      const m = TAG_RE.exec(s)
      if (m) {
        flushText(i)
        const name = m[2].toLowerCase()
        out.push({ kind: 'tag', start: i, end: i + m[0].length, raw: m[0], name, closing: m[1] === '/', known: Object.prototype.hasOwnProperty.call(KNOWN_TAGS, name) })
        textStart = i = i + m[0].length
        continue
      }
    } else if (c === '&') {
      ENTITY_RE.lastIndex = i
      const m = ENTITY_RE.exec(s)
      if (m) {
        flushText(i)
        out.push({ kind: 'entity', start: i, end: i + m[0].length, raw: m[0] })
        textStart = i = i + m[0].length
        continue
      }
    }
    i++
  }
  flushText(s.length)
  return out
}

/** @param {RichToken[]} tokens */
export const serialize = (tokens) => tokens.map((t) => t.raw).join('')

/** אורך התצוגה של אסימון: טקסט ו-'\n' — כאורכם; תגים וישויות — 0 */
const dispLen = (t) => (t.kind === 'text' || t.kind === 'nl' ? t.end - t.start : 0)

/** תווית השבב של תג לא מוכר / ישות */
export function chipLabel(t) {
  if (t.kind === 'entity') {
    const name = t.raw.slice(1, -1)
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      try { return String.fromCodePoint(code) } catch { return t.raw }
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? t.raw
  }
  if (t.name === 'img') return 'תמונה'
  return t.raw.length > 24 ? `${t.raw.slice(0, 22)}…>` : t.raw
}

/**
 * @typedef {{ kind: 'text', text: string, cls: string[], rs: number, ds: number } |
 *   { kind: 'chip', label: string, chip: 'tag'|'entity'|'img', rs: number, re: number }} LinePart
 * @typedef {{ rawStart: number, rawEnd: number, dispStart: number, parts: LinePart[], key: string }} RichLine
 * @typedef {{ raw: string, tokens: RichToken[], ds: number[], lines: RichLine[], display: string,
 *   textIdx: number[] }} RichIndex
 */

/**
 * האינדקס המלא: אסימונים, היסטי התצוגה, השורות וחלקיהן (עם מחלקות העיצוב לפי מחסנית התגים
 * הפתוחים — כמו ב-HTML, גם מעבר לסוף השורה).
 * @param {string} raw
 * @returns {RichIndex}
 */
export function buildRichIndex(raw) {
  const s = String(raw ?? '')
  const tokens = tokenize(s)
  const ds = new Array(tokens.length)
  const textIdx = []
  const lines = []
  const stack = []
  let d = 0
  let line = { rawStart: 0, rawEnd: s.length, dispStart: 0, parts: [], key: '' }
  const display = []
  tokens.forEach((t, k) => {
    ds[k] = d
    if (t.kind === 'text') {
      textIdx.push(k)
      const cls = [...new Set(stack.filter((x) => x.known).map((x) => KNOWN_TAGS[x.name]))]
      line.parts.push({ kind: 'text', text: t.raw, cls, rs: t.start, ds: d })
      display.push(t.raw)
    } else if (t.kind === 'nl') {
      textIdx.push(k)
      display.push('\n')
      line.rawEnd = t.start
      lines.push(line)
      line = { rawStart: t.end, rawEnd: s.length, dispStart: d + 1, parts: [], key: '' }
    } else if (t.kind === 'entity') {
      line.parts.push({ kind: 'chip', label: chipLabel(t), chip: 'entity', rs: t.start, re: t.end })
    } else {
      if (!t.known) line.parts.push({ kind: 'chip', label: chipLabel(t), chip: t.name === 'img' ? 'img' : 'tag', rs: t.start, re: t.end })
      if (!VOID_TAGS.has(t.name)) {
        if (!t.closing) stack.push(t)
        else {
          for (let j = stack.length - 1; j >= 0; j--) {
            if (stack[j].name === t.name) {
              stack.splice(j, 1)
              break
            }
          }
        }
      }
    }
    d += dispLen(t)
  })
  lines.push(line)
  for (const l of lines) l.key = lineKey(l)
  return { raw: s, tokens, ds, lines, display: display.join(''), textIdx }
}

// מפתח השוואה של שורה (לעדכון DOM רק בשורות שהשתנו) — בלי ההיסטים, שזזים בכל הקלדה
function lineKey(l) {
  return l.parts.map((p) => (p.kind === 'text' ? `t${p.cls.join('.')}|${p.text}` : `c${p.chip}|${p.label}`)).join('\u0001')
}

/** אינדקס האסימון שמכיל את ההיסט p (start ≤ p < end); p בסוף — האחרון; ריק — -1 */
function tokenAt(index, p) {
  const T = index.tokens
  let lo = 0
  let hi = T.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (p < T[mid].start) hi = mid - 1
    else if (p >= T[mid].end) lo = mid + 1
    else return mid
  }
  return T.length ? T.length - 1 : -1
}

/** היסט ה-raw של תו התצוגה k (0 ≤ k < אורך התצוגה) */
function rawOfDisplayChar(index, k) {
  const { textIdx, tokens, ds } = index
  let lo = 0
  let hi = textIdx.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = tokens[textIdx[mid]]
    const d0 = ds[textIdx[mid]]
    if (k < d0) hi = mid - 1
    else if (k >= d0 + (t.end - t.start)) lo = mid + 1
    else return t.start + (k - d0)
  }
  return index.raw.length
}

/**
 * חלון ה-raw של היסט תצוגה d: כל ההיסטים שנראים זהים (ביניהם רק אטומים).
 * lo — מיד אחרי תו התצוגה d-1; hi — מיד לפני תו התצוגה d.
 * @param {RichIndex} index
 * @param {number} d
 */
export function displayWindow(index, d) {
  const D = index.display.length
  const k = Math.max(0, Math.min(D, Math.trunc(d) || 0))
  const lo = k === 0 ? 0 : rawOfDisplayChar(index, k - 1) + 1
  const hi = k === D ? index.raw.length : rawOfDisplayChar(index, k)
  return { lo, hi }
}

/**
 * היסט תצוגה → היסט raw. bias 'before' — בסוף הרצף שלפני (בתוך העיצוב שנגמר כאן);
 * 'after' — בתחילת הרצף שאחרי (אחרי התגים הפותחים).
 * @param {RichIndex} index
 * @param {number} d
 * @param {'before'|'after'} [bias]
 */
export function displayToRaw(index, d, bias = 'after') {
  const w = displayWindow(index, d)
  return bias === 'before' ? w.lo : w.hi
}

/**
 * היסט raw → { d: היסט התצוגה, bias } — bias אומר באיזה קצה של חלון התצוגה הוא נמצא, כדי שההמרה
 * חזרה (displayToRaw) תחזיר אותו בדיוק כשהוא באחד הקצוות. היסט בתוך תג → קצה התג שלפניו.
 * @param {RichIndex} index
 * @param {number} p
 * @returns {{ d: number, bias: 'before'|'after' }}
 */
export function rawToDisplay(index, p) {
  const n = index.raw.length
  const q = Math.max(0, Math.min(n, Math.trunc(p) || 0))
  if (q === n) return { d: index.display.length, bias: 'after' }
  const k = tokenAt(index, q)
  if (k < 0) return { d: 0, bias: 'after' }
  const t = index.tokens[k]
  if (t.kind === 'text' || t.kind === 'nl') {
    const d = index.ds[k] + (q - t.start)
    // בתחילת אסימון טקסט שקדם לו אטום — הקצה ה"אחרי" של החלון
    const bias = q === t.start && k > 0 && dispLen(index.tokens[k - 1]) === 0 ? 'after' : 'before'
    return { d, bias: q === t.start && k === 0 ? 'after' : bias }
  }
  // בתוך אטום או בתחילתו: התצוגה = תחילת האטום
  const d = index.ds[k]
  const w = displayWindow(index, d)
  return { d, bias: q <= w.lo ? 'before' : q >= w.hi ? 'after' : 'before' }
}

/**
 * הצמדת היסט raw לגבול "חוקי" (לא באמצע תג או ישות): לתחילת האטום, או לסופו כש-toEnd.
 * @param {RichIndex} index
 * @param {number} p
 * @param {boolean} [toEnd]
 */
export function snapRaw(index, p, toEnd = false) {
  const n = index.raw.length
  const q = Math.max(0, Math.min(n, Math.trunc(p) || 0))
  const k = tokenAt(index, q)
  if (k < 0) return q
  const t = index.tokens[k]
  if ((t.kind === 'tag' || t.kind === 'entity') && q > t.start && q < t.end) return toEnd ? t.end : t.start
  return q
}

/**
 * מספר השורה (מ-0) של היסט תצוגה.
 * @param {RichIndex} index
 * @param {number} d
 */
export function lineOfDisplay(index, d) {
  const L = index.lines
  let lo = 0
  let hi = L.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (L[mid].dispStart <= d) lo = mid
    else hi = mid - 1
  }
  return lo
}

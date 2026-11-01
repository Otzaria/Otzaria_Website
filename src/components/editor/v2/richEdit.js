// פעולות העריכה של התצוגה המעוצבת (RichTextArea) על המחרוזת השמורה — לוגיקה טהורה
// (richEdit.test.js). כל פעולה מקבלת את המחרוזת והבחירה (היסטי raw) ומחזירה
// { value, caret } — המחרוזת החדשה ומיקום הסמן בה.
//
// עקרונות: תגים לעולם לא נחתכים ולא נמחקים בעקיפין — מחיקת תווים שומרת את התגים שבטווח,
// ואחר כך מסירה זוגות שנשארו ריקים (<b></b>) רק סביב העריכה עצמה. Enter בתוך תג פתוח בשורה
// (כותרת, הדגשה) סוגר אותו לפני ה-'\n' ופותח אותו מחדש אחריו — כמו בתוכן הקיים, שבו התגים
// נסגרים בכל שורה; Backspace בתחילת שורה כזו מאחד בחזרה (</h2>\n<h2> → כלום).

import { VOID_TAGS, tokenize } from './richMap'

/** @typedef {{ value: string, caret: number }} EditResult */

const isAtom = (t) => t.kind === 'tag' || t.kind === 'entity'

/** הצמדת היסט שנופל באמצע תג/ישות לקצה שלו */
function snap(tokens, p, toEnd) {
  for (const t of tokens) {
    if (t.start >= p) break
    if (isAtom(t) && p > t.start && p < t.end) return toEnd ? t.end : t.start
  }
  return p
}

const CLOSE_OPEN_PAIR = /<([a-zA-Z][a-zA-Z0-9]*)(?=[ \t>])[^<>\n]*><\/([a-zA-Z][a-zA-Z0-9]*)>/g

/**
 * הסרת זוגות תגים ריקים (<x ...></x>) שנוגעים בחלון [from, to] — שוב ושוב (זוג בתוך זוג).
 * @param {string} value
 * @param {number} from
 * @param {number} to
 * @param {number} caret
 * @returns {EditResult}
 */
export function cleanupEmptyPairs(value, from, to, caret) {
  let s = value
  let c = caret
  let a = from
  let b = to
  for (let guard = 0; guard < 64; guard++) {
    let hit = null
    CLOSE_OPEN_PAIR.lastIndex = 0
    for (let m = CLOSE_OPEN_PAIR.exec(s); m; m = CLOSE_OPEN_PAIR.exec(s)) {
      const x = m.index
      const y = x + m[0].length
      if (y < a || x > b) continue
      if (m[1].toLowerCase() !== m[2].toLowerCase() || VOID_TAGS.has(m[1].toLowerCase())) continue
      hit = [x, y]
      break
    }
    if (!hit) break
    const [x, y] = hit
    const len = y - x
    s = s.slice(0, x) + s.slice(y)
    if (c >= y) c -= len
    else if (c > x) c = x
    b = Math.max(a, b - len)
    if (a > x) a = Math.max(x, a - len)
  }
  return { value: s, caret: c }
}

/**
 * מחיקת הטווח [a, b) תוך שמירת התגים שבתוכו (ישויות — תווים נראים — נמחקות).
 * @param {string} value
 * @param {number} a
 * @param {number} b
 * @returns {{ value: string, caret: number, keptEnd: number }}
 */
function removeKeepingTags(value, a, b, multiLine = false) {
  const tokens = tokenize(value)
  const lo = snap(tokens, Math.min(a, b), false)
  const hi = snap(tokens, Math.max(a, b), true)
  if (lo >= hi) return { value, caret: lo, keptEnd: lo }
  const drop = coveredElements(tokens, lo, hi, multiLine)
  let kept = ''
  for (const t of tokens) {
    if (t.end <= lo) continue
    if (t.start >= hi) break
    if (t.kind === 'tag' && !drop.has(t)) kept += t.raw
  }
  // תגים שנזרקים מחוץ לבחירה (הפתיחה לפניה / הסגירה אחריה) — מסירים מהקצוות
  const strip = (from, to) => {
    let out = ''
    let at = from
    for (const t of tokens) {
      if (!drop.has(t) || t.start < from || t.end > to) continue
      out += value.slice(at, t.start)
      at = t.end
    }
    return out + value.slice(at, to)
  }
  const before = strip(0, lo)
  return { value: before + kept + strip(hi, value.length), caret: before.length, keptEnd: before.length + kept.length }
}

/**
 * אלמנטי עיצוב מוכרים שכל הטקסט שלהם בתוך הבחירה, כשהבחירה גם חורגת מהם (טקסט נוסף, למשל
 * Ctrl+A על כמה שורות) או כשמכניסים כמה שורות: הם לא "נשמרים" סביב הטקסט החדש — אחרת Ctrl+A
 * והקלדה/הדבקה הפכו את הכול ל-<h2>…</h2>. בחירה של מילה מודגשת בדיוק והקלדה — נשארת מודגשת.
 * @returns {Set<object>} אסימוני התגים (פתיחה וסגירה) להסרה
 */
function coveredElements(tokens, lo, hi, multiLine) {
  const drop = new Set()
  const stack = []
  const pairs = []
  for (const t of tokens) {
    if (t.kind !== 'tag' || !t.known || VOID_TAGS.has(t.name)) continue
    if (!t.closing) stack.push(t)
    else {
      const j = stack.map((x) => x.name).lastIndexOf(t.name)
      if (j >= 0) pairs.push([stack[j], t])
      if (j >= 0) stack.length = j
    }
  }
  const isText = (t) => t.kind !== 'tag'
  for (const [open, close] of pairs) {
    const inner = tokens.filter((t) => isText(t) && t.start >= open.end && t.end <= close.start)
    if (!inner.length || !inner.every((t) => t.start >= lo && t.end <= hi)) continue
    // טקסט נראה (או מעבר שורה) בבחירה מחוץ לאלמנט — לא רק רווחים צמודים
    const outside = tokens.some((t) => isText(t) && (t.kind === 'nl' || /\S/.test(t.raw)) && t.start >= lo && t.end <= hi && (t.end <= open.start || t.start >= close.end))
    if (outside || multiLine) {
      drop.add(open)
      drop.add(close)
    }
  }
  return drop
}

/**
 * החלפת הבחירה בטקסט (הקלדה, הדבקה, החלפה). הטקסט נכנס בתחילת הבחירה — בתוך העיצוב שבו היא
 * מתחילה; תגים שהיו בבחירה נשמרים, וזוגות שהתרוקנו מוסרים.
 * @param {string} value
 * @param {number} a
 * @param {number} b
 * @param {string} text
 * @returns {EditResult}
 */
export function replaceSelection(value, a, b, text) {
  const ins = String(text ?? '').replace(/\r\n?/g, '\n')
  if (a === b) {
    // הוספה בלבד — לא נוגעים בשום תג קיים (גם לא בזוג ריק שכבר היה בטקסט)
    const p = snap(tokenize(value), a, false)
    return { value: value.slice(0, p) + ins + value.slice(p), caret: p + ins.length }
  }
  const r = removeKeepingTags(value, a, b, ins.includes('\n'))
  const s = r.value.slice(0, r.caret) + ins + r.value.slice(r.caret)
  const caret = r.caret + ins.length
  return cleanupEmptyPairs(s, r.caret, r.keptEnd + ins.length, caret)
}

/** מחסנית התגים שנפתחו בשורה הנוכחית לפני p ונסגרים אחריו באותה שורה */
function openOnLineAt(value, p) {
  const lineStart = value.lastIndexOf('\n', p - 1) + 1
  let lineEnd = value.indexOf('\n', p)
  if (lineEnd < 0) lineEnd = value.length
  const tokens = tokenize(value.slice(lineStart, lineEnd))
  const rel = p - lineStart
  const stack = []
  const closesAfter = []
  for (const t of tokens) {
    if (t.kind !== 'tag' || VOID_TAGS.has(t.name)) continue
    if (t.end <= rel) {
      if (!t.closing) stack.push(t)
      else {
        const j = stack.map((x) => x.name).lastIndexOf(t.name)
        if (j >= 0) stack.splice(j, 1)
      }
    } else if (t.start >= rel && t.closing) closesAfter.push(t.name)
  }
  // רק תגים שנסגרים בהמשך השורה (תג שחוצה שורות — לא נוגעים בו)
  const avail = [...closesAfter]
  const out = []
  for (let j = stack.length - 1; j >= 0; j--) {
    const k = avail.indexOf(stack[j].name)
    if (k < 0) break
    avail.splice(k, 1)
    out.unshift(stack[j])
  }
  return out
}

/**
 * Enter: מחיקת הבחירה, ואז '\n' — בתוך תגים שנפתחו בשורה, סגירה ופתיחה מחדש סביבו.
 * @param {string} value
 * @param {number} a
 * @param {number} b
 * @returns {EditResult}
 */
export function insertLineBreak(value, a, b) {
  const r = a === b ? { value, caret: snap(tokenize(value), a, false) } : replaceSelection(value, a, b, '')
  const v = r.value
  const p = r.caret
  const open = openOnLineAt(v, p)
  const closes = open.slice().reverse().map((t) => `</${t.name}>`).join('')
  const opens = open.map((t) => t.raw).join('')
  const ins = `${closes}\n${opens}`
  const s = v.slice(0, p) + ins + v.slice(p)
  return guardJoin(v, cleanupEmptyPairs(s, p, p + ins.length, p + ins.length))
}

/**
 * Backspace אחרי Enter צריך להחזיר בדיוק את המחרוזת שלפני ה-Enter. joinAt מאחד כל "</x>\n<x>",
 * ולכן כשה-Enter נפל בין "</b><b>" שהיו כבר בטקסט (שני אלמנטים צמודים, לא פיצול) — Backspace היה
 * מאחד גם אותם. במקרה כזה מוסיפים אחרי הסמן זוג ריק "<x></x>" ש-joinAt "אוכל" במקום הזוג המקורי.
 */
function guardJoin(before, r) {
  const nl = r.value.lastIndexOf('\n', r.caret - 1)
  if (nl < 0) return r
  const rejoin = (x) => joinAt(x.slice(0, nl) + x.slice(nl + 1), nl).value
  if (rejoin(r.value) === before) return r
  // הזוג הריק נכנס בין תגי הפתיחה שבתחילת השורה החדשה — במקום שבו joinAt היה ממשיך לאחד מעבר
  // למה שה-Enter יצר. מנסים כל מקום ברצף תגי הפתיחה, מהראשון.
  const OPEN_RE = /^<([a-zA-Z][a-zA-Z0-9]*)>/
  let at = nl + 1
  for (let guard = 0; guard < 16; guard++) {
    const next = OPEN_RE.exec(r.value.slice(at))
    if (!next) break
    const pair = `<${next[1]}></${next[1]}>`
    const guarded = r.value.slice(0, at) + pair + r.value.slice(at)
    if (rejoin(guarded) === before) return { value: guarded, caret: r.caret + (at < r.caret ? pair.length : 0) }
    at += next[0].length
  }
  return r
}

// אחרי מחיקת '\n' במקום q: </x></y> מיד לפני ו-<y><x> מיד אחרי — הפיצול של Enter; מאחדים
function joinAt(value, q) {
  let s = value
  let c = q
  for (let guard = 0; guard < 16; guard++) {
    const before = /<\/([a-zA-Z][a-zA-Z0-9]*)>$/.exec(s.slice(0, c))
    const after = /^<([a-zA-Z][a-zA-Z0-9]*)>/.exec(s.slice(c))
    if (!before || !after || before[1].toLowerCase() !== after[1].toLowerCase()) break
    s = s.slice(0, c - before[0].length) + s.slice(c + after[0].length)
    c -= before[0].length
  }
  return { value: s, caret: c }
}

const COMBINING = /\p{M}/u

/** תחילת נקודת הקוד שמסתיימת ב-i (זוג תחליפי = תו אחד) */
function prevCodePointStart(s, i) {
  if (i >= 2) {
    const hi = s.charCodeAt(i - 2)
    const lo = s.charCodeAt(i - 1)
    if (hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff) return i - 2
  }
  return i - 1
}

/** סוף הגרפים שמתחיל ב-i: התו ואחריו סימני הניקוד/הטעמים שצמודים אליו */
function graphemeEnd(s, i) {
  const first = s.codePointAt(i)
  let j = i + (first > 0xffff ? 2 : 1)
  while (j < s.length && COMBINING.test(s[j])) j++
  return j
}

/**
 * Backspace / Delete (ו-Ctrl+ למילה). מדלגים על תגים (לא נמחקים); תו בעברית עם ניקוד — Backspace
 * מוחק נקודת קוד אחת (כמו ב-textarea), Delete — את כל הגרפים. בתחילת/סוף שורה — '\n' נמחק
 * ופיצול Enter מתאחד.
 * @param {string} value
 * @param {number} a
 * @param {number} b
 * @param {{ forward?: boolean, word?: boolean }} [opts]
 * @returns {EditResult}
 */
export function deleteAt(value, a, b, { forward = false, word = false } = {}) {
  if (a !== b) return replaceSelection(value, a, b, '')
  const tokens = tokenize(value)
  const p = snap(tokens, a, forward)
  // אסימוני הטקסט (כולל '\n' וישויות) בכיוון המחיקה, בלי התגים
  const seq = forward
    ? tokens.filter((t) => t.kind !== 'tag' && t.end > p)
    : tokens.filter((t) => t.kind !== 'tag' && t.start < p).reverse()
  if (!seq.length) return { value, caret: p }
  const first = seq[0]
  if (first.kind === 'nl') {
    const s = value.slice(0, first.start) + value.slice(first.end)
    return joinAt(s, first.start)
  }
  if (first.kind === 'entity') return cleanupEmptyPairs(value.slice(0, first.start) + value.slice(first.end), first.start, first.start, first.start)
  let from
  let to
  if (!word) {
    if (forward) {
      from = Math.max(p, first.start)
      to = graphemeEnd(value, from)
    } else {
      to = Math.min(p, first.end)
      from = prevCodePointStart(value, to)
    }
    const s = value.slice(0, from) + value.slice(to)
    return cleanupEmptyPairs(s, from, from, from)
  }
  // מילה: רווחים ואז רצף שאינו רווח, בתוך השורה, על פני כמה אסימוני טקסט (התגים נשמרים)
  let phase = 0
  let edge = p
  outer: for (const t of seq) {
    if (t.kind !== 'text') break
    const lo = Math.max(t.start, forward ? p : t.start)
    const hi = Math.min(t.end, forward ? t.end : p)
    if (forward) {
      for (let i = lo; i < hi; i++) {
        const sp = /\s/.test(value[i])
        if (phase === 0 && !sp) phase = 1
        else if (phase === 1 && sp) break outer
        edge = i + 1
      }
    } else {
      for (let i = hi - 1; i >= lo; i--) {
        const sp = /\s/.test(value[i])
        if (phase === 0 && !sp) phase = 1
        else if (phase === 1 && sp) break outer
        edge = i
      }
    }
  }
  if (edge === p) return deleteAt(value, a, b, { forward })
  return forward ? replaceSelection(value, p, edge, '') : replaceSelection(value, edge, p, '')
}

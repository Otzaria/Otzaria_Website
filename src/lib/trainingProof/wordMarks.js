// מילים חשודות בשורת-זיהוי ("המגיה", docs/76 §13 בתחנה) — טהור, בלי DOM.
// בכל פריט ocr יכול להגיע שדה-רשות marks: [{i, word, level, sugg?}] — i = מקום המילה ב-text.split(),
// level = 'fix' ("הצעת תיקון", עם עד 3 חלופות ב-sugg) או 'check' ("בדוק מילה זו", בלי חלופות).
// אין תיקון אוטומטי: המתנדב רואה את הסימון, ובחירה בחלופה רק מכניסה אותה לשדה-העריכה.
// פריט בלי השדה (חבילה ישנה) — כמו קודם. השדה לא חוזר לתחנה (returnFile — בלי שינוי).

export const MARK_LEVELS = Object.freeze(['fix', 'check']);
export const MAX_SUGG = 3;
const MAX_MARKS = 60;
const MAX_WORD = 80;
// כמה מקומות מילה יכולה לזוז (הוספה/מחיקה של מילה לפניה) ועדיין לשמור את הסימון שלה
const NEAR = 3;

const words = (text) =>
  String(text ?? '')
    .split(/\s+/u)
    .filter(Boolean);
const okWord = (s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_WORD && !/[\s<>]/u.test(s);

// השדה כמו שהגיע מהתחנה ← הצורה שנשלחת לדפדפן, או null (אין / לא תקין). פריט פגום יורד לבד;
// מילה שאינה במקומה בטקסט — יורדת. fix בלי חלופה תקינה ← check.
export function cleanMarks(raw, text) {
  if (!Array.isArray(raw)) return null;
  const ws = words(text);
  const out = [];
  const seen = new Set();
  for (const m of raw.slice(0, MAX_MARKS * 2)) {
    if (out.length >= MAX_MARKS) break;
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const { i, word } = m;
    if (!Number.isInteger(i) || i < 0 || i >= ws.length || seen.has(i) || ws[i] !== word || !MARK_LEVELS.includes(m.level)) continue;
    let level = m.level;
    const sugg = [];
    if (level === 'fix' && Array.isArray(m.sugg)) {
      for (const s of m.sugg) {
        if (sugg.length >= MAX_SUGG) break;
        const v = typeof s === 'string' ? s.trim() : '';
        if (okWord(v) && v !== word && !sugg.includes(v)) sugg.push(v);
      }
    }
    if (level === 'fix' && !sugg.length) level = 'check';
    seen.add(i);
    out.push(level === 'fix' ? { i, word, level, sugg } : { i, word, level });
  }
  out.sort((a, b) => a.i - b.i);
  return out.length ? out : null;
}

// הסימונים על הטקסט שמוצג עכשיו (למשל אחרי "תקן"): מילה שלא השתנתה שומרת את הסימון, גם אם זזה
// עד NEAR מקומות (המקום הקרוב); מילה שתוקנה — הסימון יורד. ← [{...סימון, i: המקום בטקסט הזה}]
export function marksForText(marks, text) {
  if (!Array.isArray(marks) || !marks.length) return [];
  const ws = words(text);
  const out = [];
  const used = new Set();
  for (const m of marks) {
    let at = ws[m.i] === m.word && !used.has(m.i) ? m.i : -1;
    for (let d = 1; at < 0 && d <= NEAR; d += 1) {
      for (const j of [m.i - d, m.i + d]) {
        if (at < 0 && j >= 0 && j < ws.length && ws[j] === m.word && !used.has(j)) at = j;
      }
    }
    if (at < 0) continue;
    used.add(at);
    out.push({ ...m, i: at });
  }
  return out.sort((a, b) => a.i - b.i);
}

// הטקסט מחולק למקטעים לציור: [{text, mark?}] — רווחים כמו שהם, ומילה מסומנת במקטע משלה
export function markedSegments(text, marks) {
  const src = String(text ?? '');
  const by = new Map((marks || []).map((m) => [m.i, m]));
  const out = [];
  let k = 0;
  let plain = '';
  for (const part of src.split(/(\s+)/u)) {
    if (!part) continue;
    if (/^\s+$/u.test(part)) {
      plain += part;
      continue;
    }
    const m = by.get(k);
    k += 1;
    if (m) {
      if (plain) out.push({ text: plain });
      plain = '';
      out.push({ text: part, mark: m });
    } else plain += part;
  }
  if (plain) out.push({ text: plain });
  return out;
}

// מחליף את המילה ה-i בטקסט (הרווחים שסביבה נשמרים). ← {text, caret: סוף המילה החדשה} או null
export function replaceWord(text, i, word) {
  const src = String(text ?? '');
  const re = /\S+/gu;
  let m;
  let k = 0;
  while ((m = re.exec(src))) {
    if (k === i) {
      const s = m.index;
      const e = s + m[0].length;
      return {
        text: src.slice(0, s) + word + src.slice(e),
        caret: s + word.length,
      };
    }
    k += 1;
  }
  return null;
}

export const LEVEL_HE = Object.freeze({
  fix: 'הצעת תיקון',
  check: 'בדוק מילה זו',
});

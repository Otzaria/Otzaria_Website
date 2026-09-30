// עזרי-תצוגה טהורים לעורך הגהת-העמודים: פירוק שורה למילים עם סימוניהן,
// בדיקות-פגיעה על הסריקה, ושורות שבולטות ממסגרת. בלי DOM.

import { BUILTIN_STREAMS, isFurnitureStream } from './vocab.js';

// פירוק טקסט-השורה לאסימונים (מילים ורווחים). i = מספר-המילה בסדר-הקריאה —
// אותו אינדקס של alternatives[].i, lm_flags[].i, flags.low_words ו-words[].
export function wordTokens(line, lowWord = 0.95) {
  const low = new Set(line?.flags?.low_words || []);
  (line?.words || []).forEach((w, i) => {
    if (typeof w?.conf === 'number' && w.conf < lowWord) low.add(i);
  });
  const alts = new Map((line?.alternatives || []).map((a) => [a.i, a]));
  const lm = new Map((line?.lm_flags || []).map((f) => [f.i, f]));
  const out = [];
  let i = 0;
  for (const part of String(line?.text ?? '').split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out.push({ kind: 'space', text: part });
      continue;
    }
    const f = lm.get(i);
    out.push({
      kind: 'word',
      text: part,
      i,
      low: low.has(i),
      alt: alts.get(i) || null,
      lm: f || null,
      lmKinds: f?.kinds || [],
      styles: line?.words?.[i]?.styles || [],
    });
    i++;
  }
  return out;
}

export function wordCount(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

// החלפת מילה i בטקסט, בלי לגעת ברווחים שסביבה
export function replaceWord(text, i, word) {
  let n = 0;
  return String(text ?? '')
    .split(/(\s+)/)
    .map((p) => {
      if (!p || /^\s+$/.test(p)) return p;
      return n++ === i ? word : p;
    })
    .join('');
}

export function normRect(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map(Math.round);
}

const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// שורות שמרכזן בתוך המלבן (בחירה בגרירה)
export function linesInRect(lines, r) {
  return lines
    .filter((l) => {
      if (!l.bbox) return false;
      const [x, y] = center(l.bbox);
      return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
    })
    .map((l) => l.id);
}

// השורה שמתחת לנקודה — הקטנה ביותר המכילה אותה (תיבות חופפות)
export function hitLine(lines, [x, y]) {
  let best = null;
  let bestArea = Infinity;
  for (const l of lines) {
    const b = l.bbox;
    if (!b || x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    const a = (b[2] - b[0]) * (b[3] - b[1]);
    if (a < bestArea) {
      best = l;
      bestArea = a;
    }
  }
  return best;
}

// מסגרת שהנקודה על מסגרתה או בתוכה (הקטנה ביותר)
export function hitFrame(frames, [x, y], tol = 0) {
  let best = null;
  let bestArea = Infinity;
  for (const f of frames || []) {
    const b = f.bbox;
    if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) continue;
    const a = (b[2] - b[0]) * (b[3] - b[1]);
    if (a < bestArea) {
      best = f;
      bestArea = a;
    }
  }
  return best;
}

const overlaps = (a, b) => Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
// סובלנות של פיקסל אחד — כמו strict_where בתוכנת-הספר: שורה שבולטת יותר
// מזה מהמסגרת אינה נספרת אצלם כתיוג
const STRICT_TOL = 1;
const inside = (a, b, tol = STRICT_TOL) => a[0] >= b[0] - tol && a[1] >= b[1] - tol && a[2] <= b[2] + tol && a[3] <= b[3] + tol;

// שורות-תוכן שנוגעות במסגרת-טקסט אבל אינן כולן בתוך אף מסגרת — "בולטות מהמסגרת"
// ואינן נספרות כתיוג (קו אדום מקווקו במדריך-התיוג §3). שורת ריהוט (כותרת-רצה, תחתית,
// מפריד) שרק נוגעת בקצה של מסגרת אינה "בולטת": היא ממילא לא אמורה להיות בתוכה (שורה
// שמרכזה בתוך מסגרת-טקסט כבר קיבלה בתצוגה את זרם המסגרת, ונבדקת כשורת-תוכן). גם שורה
// שזרמה נקבע ביד (stream_src 'human' — למשל "השורה שייכת למסגרת הזו",
// scanGeometry.straddleClaim) אינה בולטת: היא נספרת כתיוג בלי קשר למסגרות
export function straddlingLineIds(lines, frames) {
  const tf = (frames || []).filter((f) => !f.kind);
  if (!tf.length) return new Set();
  const out = new Set();
  for (const l of lines) {
    if (!l.bbox || l.status === 'removed' || isFurnitureStream(l.stream) || l.stream_src === 'human') continue;
    if (tf.some((f) => inside(l.bbox, f.bbox))) continue;
    if (tf.some((f) => overlaps(l.bbox, f.bbox))) out.add(l.id);
  }
  return out;
}

// הזרמים לבחירה: של הספר (בסדר העמוד) ואחריהם אוצר-המילים שעוד לא בשימוש
export function streamChoices(doc) {
  const seen = new Set();
  const list = [];
  const push = (s) => {
    if (!s?.key || seen.has(s.key)) return;
    seen.add(s.key);
    list.push({ key: s.key, he: s.he || BUILTIN_STREAMS[s.key]?.he || s.key, color: s.color || BUILTIN_STREAMS[s.key]?.color || '#888' });
  };
  (doc?.streams || []).forEach(push);
  (doc?.stream_vocab || []).forEach(push);
  return list;
}

// שורות-תוכן שעוד לא נבדקו בהגשה הזו (לא תוקנו, לא אושרו, לא הוסרו, לא
// חדשות) — ובלי שורות שאושרו כבר לפני ההגהה הזו (view._preOk: במעבר שני,
// מה שאושר בסבב הקודם), שאין צורך לאשר שוב
export function untouchedLineIds(view) {
  const pre = view?._preOk instanceof Set ? view._preOk : null;
  return (view?.lines || [])
    .filter((l) => l.id > 0 && !l._textEdited && !l._ok && !l._new && l.status !== 'removed' && !isFurnitureStream(l.stream) && !pre?.has(l.id))
    .map((l) => l.id);
}

// מזהה-מסגרת חדש: 6 תווים הקסדצימליים (כמו new_fid אצלם)
export function newFid(taken = new Set(), rand = Math.random) {
  for (;;) {
    const fid = Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0');
    if (!taken.has(fid)) return fid;
  }
}

// סיכום להתקדמות המתייג
export function viewStats(view, ops) {
  const lines = (view?.lines || []).filter((l) => l.id > 0);
  return {
    lines: lines.length,
    edited: lines.filter((l) => l._textEdited).length,
    ok: lines.filter((l) => l._ok).length,
    removed: lines.filter((l) => l.status === 'removed').length,
    frames: (view?.frames || []).length,
    ops: ops.length,
  };
}

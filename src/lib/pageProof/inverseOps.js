// "החזר למקור" לשינוי שהתקבל ממישהו אחר (הבודק השני, עמוד שנפתח מחדש — docs/63 §4–§5): לא מספיק להוריד את הפעולה
// מהטיוטה — ההגשה הקודמת אולי כבר הוחלה בתוכנת-הספר (בעמוד שנפתח מחדש — תמיד), ואז "הורדה" אינה מגיעה לספר. לכן
// במקומה נכנסת פעולה הפוכה ומפורשת: הערך כפי שהוא בעמוד המקורי (page.doc — לפני כל פעולות הטיוטה). בעורך היא אינה
// משנה דבר (העמוד חוזר למה שהיה), ובספר היא מחזירה את הערך הקודם.
//
// inverseOps(doc, op) ← רשימת פעולות (אולי ריקה — לפעולה שאין לה היפוך בחוזה: אישור-שורה, תיקוני-חיתוך, "החיתוך
// תקין"). כל פעולה שמוחזרת עוברת את ops.validateOp מול העמוד, ומסומנת revert: true — כך הדחיסה לפני ההגשה
// (ops.compactOps/bookOrder) אינה מורידה אותה כ"זהה למקור". טהור.
// סגנון-תו וגבול-פסקה — למצב שבעמוד המקורי (לא היפוך של on): מילה שהיה לה הסגנון — חוזרת אליו, ושלא היה — בלעדיו.
// קישור — כמו שהיה בעמוד המקורי, גם כשהצד השני בעמוד אחר (עמוד, מספר-שורה ותחילת-הטקסט).

import { REVERT_STATUSES, validateOp } from './ops.js';
import { CERTAINTY, PAGE_TYPES, PARA_STYLES, SCRIPTS, isStreamKey } from './vocab.js';

const lineMap = (doc) => new Map((doc?.lines || []).filter((l) => l && Number.isInteger(l.id)).map((l) => [l.id, l]));

// לכל ערך — השורות שלו (פעולה אחת לכל ערך שונה); ערך שאינו תקף — השורה מדולגת
function byValue(kind, page, ids, lines, valueOf) {
  const groups = new Map();
  for (const id of ids || []) {
    const l = lines.get(id);
    if (!l) continue;
    const v = valueOf(l);
    if (v === undefined) continue;
    const k = JSON.stringify(v);
    if (!groups.has(k)) groups.set(k, { v, ids: [] });
    groups.get(k).ids.push(id);
  }
  return [...groups.values()].map((g) => ({ kind, page, ids: g.ids, value: g.v }));
}

// הקישור שיצא מהשורה בעמוד המקורי ← link_add שמחזיר אותו (או null). צד הגוף בעמוד אחר — עם העמוד, מספר-השורה
// ותחילת-הטקסט שלו (כמו בחוזה-העמוד)
function baseLinkAdd(doc, fromLine) {
  const k = (doc?.links || []).find((x) => x && x.from_line === fromLine && Number.isInteger(x.to_line));
  if (!k) return null;
  const value = {};
  if (Array.isArray(k.from_words)) value.from_words = k.from_words.slice();
  if (Array.isArray(k.to_words)) value.to_words = k.to_words.slice();
  if (typeof k.kind === 'string') value.kind = k.kind;
  if (Number.isInteger(k.to_page) && k.to_page !== doc.page) {
    value.to_page = k.to_page;
    if (Number.isInteger(k.to_line_no)) value.to_line_no = k.to_line_no;
    if (typeof k.to_text === 'string') value.to_text = k.to_text;
  }
  return { kind: 'link_add', page: doc.page, ids: [fromLine, k.to_line], value: Object.keys(value).length ? value : null };
}

// סגנון-תו בטווח ← למצב שבעמוד המקורי: רצפים של מילים עם הסגנון (on) ובלעדיו (off)
function baseStyles(P, id, l, v) {
  const [lo, hi] = Array.isArray(v?.words) ? v.words : [];
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) return [];
  const words = Array.isArray(l?.words) ? l.words : [];
  const has = (i) => Array.isArray(words[i]?.styles) && words[i].styles.includes(v.style);
  const out = [];
  let start = lo;
  for (let i = lo; i <= hi + 1; i++) {
    if (i <= hi && has(i) === has(start)) continue;
    out.push({ kind: 'styles', page: P, ids: [id], value: { style: v.style, words: [start, i - 1], on: has(start) } });
    start = i;
  }
  return out;
}

function raw(doc, op) {
  const P = op.page;
  const lines = lineMap(doc);
  const ids = Array.isArray(op.ids) ? op.ids : [];
  const v = op.value;
  switch (op.kind) {
    case 'text':
      return byValue('text', P, ids, lines, (l) => String(l.text ?? l.text_ocr ?? ''));
    case 'stream':
      return byValue('stream', P, ids, lines, (l) => (isStreamKey(l.stream) ? l.stream : undefined));
    case 'para':
      return byValue('para', P, ids, lines, (l) => (Object.hasOwn(PARA_STYLES, l.para_style) ? l.para_style : undefined));
    case 'para_start':
      return byValue('para_start', P, ids, lines, (l) => (l.para_start ? 1 : 0));
    case 'script':
      return byValue('script', P, ids, lines, (l) => (Object.hasOwn(SCRIPTS, l.script) ? l.script : undefined));
    case 'styles':
      return v && typeof v === 'object' ? ids.flatMap((id) => baseStyles(P, id, lines.get(id), v)) : [];
    case 'para_break':
      return v && typeof v === 'object' && Number.isInteger(v.word)
        ? byValue('para_break', P, ids, lines, (l) => ({ word: v.word, on: Array.isArray(l.para_breaks) && l.para_breaks.includes(v.word) }))
        : [];
    case 'status':
      return byValue('status', P, ids, lines, (l) => (l.status === 'removed' ? 'removed' : 'restore'));
    case 'mixed_line':
      return byValue('mixed_line', P, ids, lines, (l) => (l.flags?.mixed_line ? 1 : 0));
    case 'certainty':
      return byValue('certainty', P, ids, lines, (l) =>
        Object.hasOwn(CERTAINTY, l.certainty) ? { v: l.certainty, why: typeof l.certainty_why === 'string' ? l.certainty_why : null } : undefined
      );
    case 'train_text':
      return byValue('train_text', P, ids, lines, (l) => (l.train_text === 0 ? 0 : 1));
    case 'page_type':
      return Object.hasOwn(PAGE_TYPES, doc?.page_type) ? [{ kind: 'page_type', page: P, value: doc.page_type }] : [];
    case 'link_add': {
      const back = baseLinkAdd(doc, ids[0]);
      return [back || { kind: 'link_del', page: P, value: { src_line: ids[0], page: P } }];
    }
    case 'link_del': {
      const back = baseLinkAdd(doc, v?.src_line);
      return back ? [back] : [];
    }
    // "החזר לאוטומטי" (link_reset) — רק על קישור שהגיע מבוטל ("אין קישור"): ההיפוך הוא שוב "אין קישור"
    case 'link_reset':
      return Number.isInteger(v?.src_line) ? [{ kind: 'link_del', page: P, value: { src_line: v.src_line, page: P } }] : [];
    case 'frames_set':
    case 'frames_clear': {
      const frames = Array.isArray(doc?.frames) ? doc.frames : [];
      if (!frames.length) return [{ kind: 'frames_clear', page: P }];
      return [{ kind: 'frames_set', page: P, value: { frames: frames.map((f) => ({ ...f })), ...(doc.frames_confirmed ? { confirmed: true } : {}) } }];
    }
    default:
      return [];
  }
}

export function inverseOps(doc, op) {
  if (!doc || !op || typeof op !== 'object' || op._local) return [];
  const lines = lineMap(doc);
  return raw(doc, op)
    .filter((o) => !validateOp(doc, o))
    .map((o) => {
      const r = { ...o, revert: true };
      // תיקון-טקסט: גם מצב-השורה שבעמוד המקורי (ops.sanitizeOp — revert_status)
      const st = o.kind === 'text' ? lines.get(o.ids[0])?.status : null;
      if (REVERT_STATUSES.includes(st)) r.revert_status = st;
      return r;
    });
}

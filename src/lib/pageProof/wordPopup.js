// חלונית ההצעות למילה — החלק הטהור: אילו הצעות יש למילה, בסדר מה, ואיפה
// למקם את החלונית ליד המילה. בלי DOM, כדי שאפשר יהיה לבדוק ב-node:test.
// (מכונת-המצבים של הפתיחה והסגירה — popupState.js.)
//
// המקורות בחוזה-העמוד (docs/37 בחבילה):
//   alternatives[] = {i, word, p, alts:[{text, p}], other_p} — p = ההסתברות
//     המכוילת שהמילה המקורית נכונה; alts = עד 3 חלופות-זיהוי; other_p = "אף אחת".
//   lm_flags[] = {i, word, kinds, lm:[{text, gain}], rec:[{text, gain}]} —
//     lm (סגול): מודל-השפה מציע מילה משלו, דומה בכתיב; rec (כתום): אחת מחלופות
//     הזיהוי מתאימה יותר להקשר. gain = לוג-יחס (לא אחוז) — משמש רק לסדר.
// אין תיקון אוטומטי לעולם: מציגים, והמגיה בוחר.

import { tokenize } from './textModel.js';

// הקבוצות בסדר ההצגה. rec ראשונה — שני המודלים מסכימים עליה (הזיהוי ראה
// אותה, ומודל-השפה מעדיף אותה בהקשר); אחריה חלופות-הזיהוי לפי הסתברות;
// ובסוף ההצעות של מודל-השפה לבדו (החלשות ביותר — הוא לא ראה את הדף).
export const SUGGESTION_GROUPS = [
  { kind: 'rec', he: 'מתאימה להקשר', hint: 'אחת מחלופות הזיהוי, שמודל-השפה מעדיף בהקשר של המשפט' },
  { kind: 'alt', he: 'חלופות הזיהוי', hint: 'מה עוד מודל-הזיהוי חשב שכתוב כאן, עם הסבירות' },
  { kind: 'lm', he: 'הצעת מודל-השפה', hint: 'מילה דומה בכתיב שמתאימה יותר להקשר' },
];

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const validText = (t) => typeof t === 'string' && t.trim() !== '';
const byGain = (list) => (Array.isArray(list) ? [...list] : []).sort((a, b) => (num(b?.gain) ?? -Infinity) - (num(a?.gain) ?? -Infinity));
const byP = (list) => (Array.isArray(list) ? [...list] : []).sort((a, b) => (num(b?.p) ?? -Infinity) - (num(a?.p) ?? -Infinity));

// מפתח-המילה של החלונית (כמו ב-popupState): "<מזהה-שורה>:<מספר-מילה>"
export const popupWordKey = (lineId, i) => `${lineId}:${i}`;

// טקסט המילה i בשורה (אותו כלל-פיצול של textModel.tokenize), או null
export function wordText(line, i) {
  if (!Number.isInteger(i) || i < 0) return null;
  const w = tokenize(line?.text ?? '').filter((t) => t.w === 'word')[i];
  return w ? w.text : null;
}

// אחוז לתצוגה: 0.347 ← "35%"; ערכים קיצוניים לא מעוגלים ל-0%/100%
export function formatPct(p) {
  const v = num(p);
  if (v == null) return '';
  const r = Math.round(v * 100);
  if (r <= 0 && v > 0) return '<1%';
  if (r >= 100 && v < 1) return '>99%';
  return `${Math.max(0, Math.min(100, r))}%`;
}

// כל ההצעות למילה i בשורה, כרשימה אחת לבחירה (גם במקלדת):
// {word, p, otherP, kinds, items:[{text, kind, p, gain, also:[kinds]}]}.
// הצעה שחוזרת בכמה מקורות מופיעה פעם אחת — בקבוצה הראשונה לפי הסדר — ו-also
// מציין את המקורות הנוספים; p = הסתברות-הזיהוי שלה אם ידועה. הצעה ריקה או
// זהה למילה עצמה — מושמטת. null אם אין מילה כזו בשורה.
export function suggestionData(line, i) {
  const word = wordText(line, i);
  if (word == null) return null;
  const alt = (line?.alternatives || []).find((a) => a && a.i === i) || null;
  const flag = (line?.lm_flags || []).find((f) => f && f.i === i) || null;

  const altP = new Map();
  for (const a of alt?.alts || []) if (validText(a?.text) && !altP.has(a.text.trim())) altP.set(a.text.trim(), num(a.p));
  const sources = new Map(); // text → קבוצת המקורות שהציעו אותה
  const note = (text, kind) => {
    if (!sources.has(text)) sources.set(text, new Set());
    sources.get(text).add(kind);
  };
  for (const r of flag?.rec || []) if (validText(r?.text)) note(r.text.trim(), 'rec');
  for (const a of alt?.alts || []) if (validText(a?.text)) note(a.text.trim(), 'alt');
  for (const l of flag?.lm || []) if (validText(l?.text)) note(l.text.trim(), 'lm');

  const seen = new Set([word]);
  const items = [];
  const add = (entry, kind) => {
    if (!validText(entry?.text)) return;
    const text = entry.text.trim();
    if (seen.has(text)) return;
    seen.add(text);
    items.push({
      text,
      kind,
      p: altP.has(text) ? altP.get(text) : null,
      gain: kind === 'alt' ? null : num(entry.gain),
      also: [...sources.get(text)].filter((k) => k !== kind),
    });
  };
  for (const r of byGain(flag?.rec)) add(r, 'rec');
  for (const a of byP(alt?.alts)) add(a, 'alt');
  for (const l of byGain(flag?.lm)) add(l, 'lm');

  return {
    word,
    p: num(alt?.p),
    otherP: num(alt?.other_p),
    kinds: Array.isArray(flag?.kinds) ? flag.kinds.filter((k) => k === 'lm' || k === 'rec') : [],
    items,
  };
}

// האם יש למילה משהו להציע (רק אז החלונית נפתחת)
export function hasSuggestions(line, i) {
  return (suggestionData(line, i)?.items.length ?? 0) > 0;
}

// תזוזה ברשימה במקלדת, עם גלישה מהסוף להתחלה ולהפך
export function moveActive(index, delta, count) {
  if (!(count > 0)) return 0;
  const cur = Number.isInteger(index) && index >= 0 && index < count ? index : delta > 0 ? -1 : count;
  return (((cur + delta) % count) + count) % count;
}

const clamp = (v, lo, hi) => (hi < lo ? lo : Math.max(lo, Math.min(hi, v)));

// מיקום החלונית (position: fixed) ליד המילה.
// anchor = {left, top, right, bottom} של המילה (getBoundingClientRect);
// size = {width, height} של החלונית; viewport = {width, height}.
// מתחת למילה כברירת-מחדל; מעליה רק כשאין מקום מתחת ויש יותר מקום מעל.
// אופקית: בעברית הקצה הימני של החלונית מול הקצה הימני של המילה (align
// 'right'), ותמיד בתוך המסך עם שוליים. מחזיר {top, left, above}.
export function placePopup(anchor, size, viewport, { gap = 4, margin = 8, align = 'right' } = {}) {
  const a = {
    left: num(anchor?.left) ?? 0,
    top: num(anchor?.top) ?? 0,
    right: num(anchor?.right) ?? num(anchor?.left) ?? 0,
    bottom: num(anchor?.bottom) ?? num(anchor?.top) ?? 0,
  };
  const w = Math.max(0, num(size?.width) ?? 0);
  const h = Math.max(0, num(size?.height) ?? 0);
  const vw = Math.max(0, num(viewport?.width) ?? 0);
  const vh = Math.max(0, num(viewport?.height) ?? 0);

  const spaceBelow = vh - margin - (a.bottom + gap);
  const spaceAbove = a.top - gap - margin;
  const above = h > spaceBelow && spaceAbove > spaceBelow;
  const top = clamp(above ? a.top - gap - h : a.bottom + gap, margin, vh - margin - h);
  const left = clamp(align === 'left' ? a.left : a.right - w, margin, vw - margin - w);
  return { top: Math.round(top), left: Math.round(left), above };
}

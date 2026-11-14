// צורת הדף — בדיקת החבילה הנכנסת (PACKAGE.md §1, §5), טהור: manifest, רשומות העמודים, ההחלטות והתרגול,
// ושמות קובצי התמונה. כל פונקציה מחזירה {value} או {error} בעברית (ההודעה נכנסת לסיכום הייבוא).

import { SLUG_RE, DAFKEY_RE, isObj, words, fracBox, cleanText } from './common.js';
import { questionOf } from './questions.js';

export const FORMAT = 'tzurat-review/1';
export const MAX_ERRORS = 20;
export const ENTRY = Object.freeze({ manifest: 'manifest.json', pages: 'pages.jsonl', items: 'items.jsonl', practice: 'practice.jsonl' });
// ההכרעות שמותרות כתשובה הצפויה בתרגול
export const PRACTICE_VERDICTS = Object.freeze(['print', 'otz', 'other', 'elsewhere']);

const IMAGE_RE = /^images\/(\d{3}[ab])\.(scan|ours)\.(png|webp|jpe?g)$/;
const posInt = (v) => Number.isInteger(v) && v > 0 && v < 100000;
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);

/** שם קובץ בתוך ה-ZIP ← {dafKey, side, ext} לתמונה מוכרת, או null */
export function imageEntry(name) {
  const m = IMAGE_RE.exec(String(name || ''));
  if (!m) return null;
  return { dafKey: m[1], side: m[2], ext: m[3] === 'jpeg' ? 'jpg' : m[3] };
}

// מוסיף שגיאה לרשימה המוגבלת (MAX_ERRORS); מחזיר את הרשימה
export function pushError(errors, msg) {
  if (errors.length < MAX_ERRORS) errors.push(String(msg).slice(0, 300));
  return errors;
}

/** שורות JSONL ← [{line, value}|{line, error}] (שורות ריקות מדולגות; line מ-1) */
export function parseJsonl(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    try {
      out.push({ line: i + 1, value: JSON.parse(raw) });
    } catch {
      out.push({ line: i + 1, error: 'JSON לא תקין' });
    }
  }
  return out;
}

export function parseManifest(m) {
  if (!isObj(m)) return { error: 'manifest.json חסר או אינו אובייקט' };
  if (m.format !== FORMAT) return { error: `פורמט לא נתמך: ${String(m.format).slice(0, 40)} (נדרש ${FORMAT})` };
  if (typeof m.slug !== 'string' || !SLUG_RE.test(m.slug)) return { error: 'slug לא תקין (a-z, 0-9, מקף; עד 40 תווים)' };
  const masechet = cleanText(m.masechet, 60);
  if (!masechet) return { error: 'שם המסכת (masechet) חסר' };
  const buildId = cleanText(m.buildId, 200);
  if (!buildId) return { error: 'buildId חסר' };
  const order = Number.isInteger(m.order) && m.order >= 0 ? m.order : 0;
  return {
    value: {
      format: FORMAT,
      slug: m.slug,
      masechet,
      order,
      buildId,
      created: typeof m.created === 'string' ? m.created.slice(0, 40) : null,
      pages: Number.isInteger(m.pages) ? m.pages : null,
      items: Number.isInteger(m.items) ? m.items : null,
      full: m.full === true,
    },
  };
}

// תמונה בעמוד: {file, w, h} — הקובץ חייב להיות images/<dafKey>.<side>.<ext>
function imageRef(v, dafKey, side, required) {
  if (v == null) return required ? { error: `חסרה תמונת ${side === 'scan' ? 'הסריקה' : 'העמוד שלנו'}` } : { value: null };
  if (!isObj(v)) return { error: `תמונה לא תקינה (${side})` };
  const e = imageEntry(v.file);
  if (!e || e.dafKey !== dafKey || e.side !== side) return { error: `שם קובץ תמונה לא תקין: ${String(v.file).slice(0, 60)}` };
  if (!posInt(v.w) || !posInt(v.h)) return { error: `מידות תמונה לא תקינות (${side})` };
  return { value: { file: v.file, ext: e.ext, w: v.w, h: v.h } };
}

const LINE_BOX = (v) => v == null || (Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n)));

// מודל העמוד — בדיקה קלה של המבנה (הלקוח והייצוא נשענים על blocks[].id ו-lines[].i)
export function checkModel(model) {
  if (model == null) return { value: { blocks: [] } };
  if (!isObj(model) || !Array.isArray(model.blocks)) return { error: 'מודל העמוד אינו תקין (blocks)' };
  if (model.blocks.length > 300) return { error: 'יותר מדי גושים במודל העמוד' };
  const ids = new Set();
  for (const b of model.blocks) {
    if (!isObj(b) || typeof b.id !== 'string' || !b.id || b.id.length > 40) return { error: 'גוש בלי מזהה תקין במודל העמוד' };
    if (ids.has(b.id)) return { error: `מזהה גוש כפול במודל העמוד: ${b.id}` };
    ids.add(b.id);
    if (!Array.isArray(b.lines)) return { error: `גוש ${b.id}: אין שורות` };
    const lines = new Set();
    for (const l of b.lines) {
      // i שלילי — שורה מדומה (fake: הדרן/כותרת שהבנייה הוסיפה), PACKAGE.md
      if (!isObj(l) || !Number.isInteger(l.i) || (l.i < 0 && l.fake !== true)) return { error: `גוש ${b.id}: שורה בלי מספר` };
      if (lines.has(l.i)) return { error: `גוש ${b.id}: מספר שורה כפול ${l.i}` };
      lines.add(l.i);
      if (!LINE_BOX(l.ours) || !LINE_BOX(l.scan)) return { error: `גוש ${b.id} שורה ${l.i}: מיקום לא תקין` };
      if (l.words != null && !Array.isArray(l.words)) return { error: `גוש ${b.id} שורה ${l.i}: מילים לא תקינות` };
    }
  }
  return { value: model };
}

export function parsePageRecord(r) {
  if (!isObj(r)) return { error: 'רשומת עמוד אינה אובייקט' };
  if (typeof r.dafKey !== 'string' || !DAFKEY_RE.test(r.dafKey)) return { error: `dafKey לא תקין: ${String(r.dafKey).slice(0, 20)}` };
  const daf = cleanText(r.daf, 20);
  if (!daf) return { error: `${r.dafKey}: daf חסר` };
  const scan = imageRef(r.scan, r.dafKey, 'scan', true);
  if (scan.error) return { error: `${r.dafKey}: ${scan.error}` };
  const ours = imageRef(r.ours, r.dafKey, 'ours', false);
  if (ours.error) return { error: `${r.dafKey}: ${ours.error}` };
  const model = checkModel(r.model);
  if (model.error) return { error: `${r.dafKey}: ${model.error}` };
  const pdf = isObj(r.pdf) && Number.isInteger(r.pdf.page) && r.pdf.page >= 0 ? { file: cleanText(r.pdf.file, 200), page: r.pdf.page } : null;
  return {
    value: {
      dafKey: r.dafKey,
      daf,
      order: Number.isInteger(r.order) && r.order >= 0 ? r.order : 0,
      pdf,
      scan: scan.value,
      ours: ours.value,
      nonVilna: r.nonVilna === true,
      changed: r.changed === true,
      model: model.value,
    },
  };
}

export function parseItemRecord(r, slug) {
  if (!isObj(r)) return { error: 'רשומת החלטה אינה אובייקט' };
  const key = str(r.sourceKey, 600);
  if (!key || !key.startsWith(`${slug}|`)) return { error: `sourceKey לא תקין (צריך להתחיל ב-${slug}|)` };
  if (typeof r.dafKey !== 'string' || !DAFKEY_RE.test(r.dafKey)) return { error: `${key}: dafKey לא תקין` };
  const kind = str(r.kind, 20);
  if (!kind) return { error: `${key}: kind חסר` };
  const otz = words(r.otz);
  const print = words(r.print);
  if (!otz.length && !print.length) return { error: `${key}: אין מילים (otz ו-print ריקים)` };
  const n = Number.isInteger(r.n) && r.n >= 0 ? r.n : otz.length;
  const wi = Number.isInteger(r.wi) && r.wi >= 0 ? r.wi : 0;
  if (r.box != null && !fracBox(r.box)) return { error: `${key}: box לא תקין` };
  const value = {
    sourceKey: key,
    dafKey: r.dafKey,
    kind,
    cls: str(r.cls, 60) || '',
    ref: str(r.ref, 300) || '',
    wi,
    n,
    otz,
    print,
    ctxBefore: words(r.ctxBefore, 12),
    ctxAfter: words(r.ctxAfter, 12),
    box: fracBox(r.box),
    score: typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : 0,
    hints: isObj(r.hints) ? r.hints : null,
  };
  value.question = questionOf({ ...value, question: r.question });
  return { value };
}

export function parsePracticeRecord(r, slug) {
  const base = parseItemRecord(r, slug);
  if (base.error) return base;
  if (!PRACTICE_VERDICTS.includes(r.expected)) return { error: `${base.value.sourceKey}: expected לא תקין` };
  const text = r.expected === 'other' ? cleanText(r.text, 200) : null;
  if (r.expected === 'other' && !text) return { error: `${base.value.sourceKey}: חסר הטקסט הצפוי (text)` };
  return { value: { ...base.value, expected: r.expected, expectedText: text, explain: cleanText(r.explain, 500) } };
}

// צורת הדף — שבירת שורות (עוגנים ידניים): פעולות המתנדב על שורות הגוש, והעוגנים שנגזרים מהן.
// טהור (בלי DOM/DB) — משותף ללקוח (תצוגה מיידית של השורות אחרי הזזה) ולשרת (גזירת העוגנים בהגשה).
// הפורמט: docs/tzurat-hadaf/PACKAGE.md ("מודל העמוד", ובייצוא `anchor`).
//
// פעולה: {op:'start', block, line, ref, wi} — השורה `line` (המספר `i` שלה במודל) בגוש `block` מתחילה
// במילה (ref, wi). {op:'confirm', block, line} — השורה נבדקה ונכונה. הפעולות חלות לפי הסדר; הזזה של
// תחילת שורה k משנה רק את שורה k-1 ואת שורה k, ולכן מותרת רק כשבשתיהן נשארת לפחות מילה אחת.
// שורה מדומה (`fake`: שורת הדרן/כותרת שהבנייה הוסיפה, `i` שלילי) וגוש נעול (`editable: false`: מפרשים
// בשוליים, עמוד שאינו וילנא) אינם מקבלים פעולות.

export const MAX_LINE_OPS = 3000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** בדיקת הצורה של רשימת פעולות שהגיעה מהלקוח. מחזיר {ops} או {error} (בעברית). */
export function normalizeLineOps(raw) {
  if (raw == null) return { ops: [] };
  if (!Array.isArray(raw)) return { error: 'רשימת פעולות השורה אינה תקינה' };
  if (raw.length > MAX_LINE_OPS) return { error: 'יותר מדי פעולות שורה' };
  const ops = [];
  for (const o of raw) {
    if (!isObj(o) || typeof o.block !== 'string' || !o.block || o.block.length > 40) {
      return { error: 'פעולת שורה בלי גוש תקין' };
    }
    if (!Number.isInteger(o.line) || o.line < -10000 || o.line > 10000) return { error: 'פעולת שורה בלי מספר שורה תקין' };
    if (o.op === 'confirm') {
      ops.push({ op: 'confirm', block: o.block, line: o.line });
    } else if (o.op === 'start') {
      if (typeof o.ref !== 'string' || !o.ref || o.ref.length > 300) return { error: 'פעולת שורה בלי מילה תקינה' };
      if (!Number.isInteger(o.wi) || o.wi < 0 || o.wi > 100000) return { error: 'פעולת שורה בלי מילה תקינה' };
      ops.push({ op: 'start', block: o.block, line: o.line, ref: o.ref, wi: o.wi });
    } else {
      return { error: 'סוג פעולת שורה לא מוכר' };
    }
  }
  return { ops };
}

/** המילים של הגוש ברצף אחד, ותחילת כל שורה (אינדקס ברצף). */
export function flattenBlock(block) {
  const words = [];
  const starts = [];
  for (const line of block?.lines || []) {
    starts.push(words.length);
    for (const w of line.words || []) words.push(w);
  }
  return { words, starts };
}

function rebuildLines(block, words, starts) {
  return (block.lines || []).map((line, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : words.length;
    return { ...line, words: words.slice(starts[k], end) };
  });
}

const sameWord = (w, ref, wi) => !!w && w.ref === ref && w.wi === wi;
const locked = (block) => block?.editable === false;
const isFake = (line) => !line || line.fake === true;

/**
 * מחיל את הפעולות על המודל. מחזיר {model, applied, rejected, touched}:
 * model — עותק עם המילים בשורות אחרי ההזזות; rejected — [{op, reason}] (`unknown_line`, `first_line`,
 * `no_word`, `out_of_range`, `locked`, `fake_line`); touched — Map של `${block}:${line}` → 'start'|'confirm' (הפעולה האחרונה בשורה).
 */
export function applyLineOps(model, ops) {
  const blocks = model?.blocks || [];
  const state = new Map();
  for (const b of blocks) {
    const { words, starts } = flattenBlock(b);
    state.set(b.id, { block: b, words, starts, index: new Map((b.lines || []).map((l, k) => [l.i, k])) });
  }
  const applied = [];
  const rejected = [];
  const touched = new Map();
  for (const op of ops || []) {
    const s = state.get(op.block);
    const k = s ? s.index.get(op.line) : undefined;
    if (k === undefined) {
      rejected.push({ op, reason: 'unknown_line' });
      continue;
    }
    const key = `${op.block}:${op.line}`;
    if (locked(s.block)) {
      rejected.push({ op, reason: 'locked' });
      continue;
    }
    if (isFake(s.block.lines[k]) || (op.op === 'start' && isFake(s.block.lines[k - 1]))) {
      rejected.push({ op, reason: k === 0 && op.op === 'start' ? 'first_line' : 'fake_line' });
      continue;
    }
    if (op.op === 'confirm') {
      applied.push(op);
      if (touched.get(key) !== 'start') touched.set(key, 'confirm');
      continue;
    }
    if (k === 0) {
      rejected.push({ op, reason: 'first_line' });
      continue;
    }
    const j = s.words.findIndex((w) => sameWord(w, op.ref, op.wi));
    if (j < 0) {
      rejected.push({ op, reason: 'no_word' });
      continue;
    }
    const next = k + 1 < s.starts.length ? s.starts[k + 1] : s.words.length;
    if (!(j > s.starts[k - 1] && j < next)) {
      rejected.push({ op, reason: 'out_of_range' });
      continue;
    }
    s.starts[k] = j;
    applied.push(op);
    touched.set(key, 'start');
  }
  const out = {
    ...model,
    blocks: blocks.map((b) => {
      const s = state.get(b.id);
      return { ...b, lines: rebuildLines(b, s.words, s.starts) };
    }),
  };
  return { model: out, applied, rejected, touched };
}

/**
 * העוגנים שנגזרים מהפעולות (לייצוא ולשמירה בהגשה): לכל שורה שנגעו בה — `start` עם המילה הראשונה שלה
 * אחרי כל הפעולות (גם אם זו המילה המקורית: המתנדב קבע במפורש), או `confirm`.
 */
export function deriveAnchors(model, ops) {
  const { model: after, touched } = applyLineOps(model, ops);
  const anchors = [];
  for (const b of after.blocks || []) {
    for (const line of b.lines || []) {
      const t = touched.get(`${b.id}:${line.i}`);
      if (!t) continue;
      const first = (line.words || [])[0];
      if (t === 'start' && first && typeof first.ref === 'string') {
        anchors.push({ block: b.id, line: line.i, ref: first.ref, wi: first.wi, action: 'start' });
      } else {
        anchors.push({ block: b.id, line: line.i, action: 'confirm' });
      }
    }
  }
  return anchors;
}

/** פעולה: המילה הראשונה של שורה k (אינדקס במערך השורות) עוברת לסוף השורה הקודמת. null אם אי אפשר. */
export function opFirstWordUp(block, k) {
  const line = block?.lines?.[k];
  if (!line || k === 0 || locked(block) || isFake(line) || isFake(block.lines[k - 1])) return null;
  if ((line.words || []).length < 2) return null;
  const w = line.words[1];
  if (typeof w.ref !== 'string') return null;
  return { op: 'start', block: block.id, line: line.i, ref: w.ref, wi: w.wi };
}

/** פעולה: המילה האחרונה של שורה k עוברת לתחילת השורה הבאה. null אם אי אפשר. */
export function opLastWordDown(block, k) {
  const line = block?.lines?.[k];
  const nextLine = block?.lines?.[k + 1];
  if (!line || !nextLine || locked(block) || isFake(line) || isFake(nextLine)) return null;
  if ((line.words || []).length < 2) return null;
  const w = line.words[line.words.length - 1];
  if (typeof w.ref !== 'string') return null;
  return { op: 'start', block: block.id, line: nextLine.i, ref: w.ref, wi: w.wi };
}

/**
 * פעולה: "השורה מתחילה כאן" על מילה `w` שבשורה k או בשורה שלפניה. אם המילה בשורה k עצמה —
 * השורה k מתחילה בה (המילים שלפניה עולות). אם המילה בשורה k-1 — השורה k מתחילה בה (המילים
 * שאחריה יורדות). null אם אי אפשר.
 */
export function opStartAt(block, k, w) {
  const line = block?.lines?.[k];
  if (!line || k === 0 || !w || typeof w.ref !== 'string') return null;
  if (locked(block) || isFake(line) || isFake(block.lines[k - 1])) return null;
  return { op: 'start', block: block.id, line: line.i, ref: w.ref, wi: w.wi };
}

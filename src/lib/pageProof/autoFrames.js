// "הצעת המחשב" למסגרות — לעמוד שאין בו מסגרות: נקודת-פתיחה שהמתנדב מאשר («✓ המסגרות
// נכונות») או מתקן. טהור ודטרמיניסטי: אותה הצעה בכל חישוב-מחדש של התצוגה.
//
// לכל זרם-תוכן (בלי ריהוט — כותרת-עמוד / תחתית / מפריד):
// 1. טורים לפי כיסוי אופקי: רצועה פנימית שמכוסה בפחות ממחצית השורות שמכסות את שני צדדיה
//    היא מרזב — שורה אחת שנחתכה על פני שני טורים אינה "סוגרת" אותו. בדף שרובו ברוחב מלא
//    ורק חלקו דו-טורי המרזב נמצא בשורות הצרות (עם בדיקת-זוגות כמו _columns_of אצלם, כדי
//    ששורות-סוף-פסקה קצרות לא ייראו כטור).
// 2. שורה שלפחות מחצית רוחבה בטור אחד ואינה נכנסת עמוק לטור אחר — שייכת לטור; אחרת היא
//    "חוצה" (כותרת או פתיח על כל הרוחב — או שורה שנחתכה לא נכון).
// 3. שורות חוצות רצופות (בלי שורת-טור ביניהן) = רצף. רצף של 2+ שורות, כותרת, רצף מעל כל
//    הטורים, ושורת-סיום מתחתיהם שאינה פרושה על שני טורים — מסגרת משלהם, שמחלקת את הטורים
//    לרצועות. שורה חוצה בודדת אחרת היא כנראה חיתוך שגוי: נשארת מחוץ למסגרות ובולטת מהן
//    (מתקנים אותה במצב "שורות" ← פיצול) — כך היא לא מאחדת את שני הטורים למסגרת אחת.
// 4. מסגרת שכל שורותיה כותרת — בזרם-הכותרת (רק כשתוכנת-הספר מכירה אותו).
// seq (המספר בזרם) = סדר-הקריאה בתוך הזרם: רצועה אחר רצועה, ובכל רצועה הטורים מימין לשמאל.
// order (בעמוד): בין הזרמים — לפי סדר-הקריאה של המחשב (ה-order של השורות, כמו הסדר בטקסט);
// בתוך כל זרם — לפי seq (המקומות שהזרם תופס בעמוד נשארים, רק מי שיושב בהם מתחלף).

import { BUILTIN_STREAMS, FURNITURE_STREAMS, isStreamKey } from './vocab.js';

// מרזב: כיסוי מתחת לחלק הזה מהכיסוי המרבי שמשני צדדיו
export const GUTTER_COVER = 0.5;
// שורה בטור: לפחות החלק הזה מרוחבה בתוכו
export const IN_COLUMN = 0.5;
// ...ואינה נכנסת לטור אחר ביותר מהחלק הזה מרוחבו (שורה שנחתכה חלקית על פני המרזב)
export const INTRUDE = 0.25;
// שורה "פרושה" על טור: מכסה לפחות את החלק הזה מרוחבו
export const SPAN = 0.6;
// בדף מעורב: שורה "צרה" = עד החלק הזה מרוחב הזרם; וכמה צרות צריך כדי לחפש בהן מרזב
export const NARROW = 0.6;
export const MIN_NARROW = 4;
// בדיקת-הזוגות: לפחות החלק הזה משורות-הטורים עם שכנה באותו גובה בטור אחר
export const PAIRED = 0.5;

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const baseOf = (s) => String(s || 'main').replace(/_heading$/, '') || 'main';
const isHeadingLine = (l) => String(l?.stream || '').endsWith('_heading');
const cy = (l) => (l.bbox[1] + l.bbox[3]) / 2;
const widthOf = (b) => b[2] - b[0];
const heightOf = (b) => b[3] - b[1];
const overlapRange = (b, [a, c]) => Math.max(0, Math.min(b[2], c) - Math.max(b[0], a));
const vOverlap = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
const union = (boxes) => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

// זרם-הכותרת של זרם — רק כשתוכנת-הספר מכירה אותו (is_stream אצלם: כותרות של ראשי ושל
// ההערות, וזרמים מותאמים s_…). "margin_heading" למשל נדחה שם, והמסגרת הייתה נשמטת בקליטה.
export function headingStream(stream) {
  const b = baseOf(stream);
  const key = `${b}_heading`;
  if (Object.hasOwn(BUILTIN_STREAMS, key)) return key;
  return b.startsWith('s_') && isStreamKey(key) ? key : null;
}

// הטורים של קבוצת-שורות — טווחי-x [a, b] מימין לשמאל (טור אחד כשאין מרזב)
export function columnRanges(lines) {
  const ls = (lines || []).filter((l) => isBox(l?.bbox) && widthOf(l.bbox) > 0);
  if (!ls.length) return [];
  const xs = [...new Set(ls.flatMap((l) => [l.bbox[0], l.bbox[2]]))].sort((a, b) => a - b);
  const seg = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    let cov = 0;
    for (const l of ls) if (l.bbox[0] <= a && l.bbox[2] >= b) cov++;
    seg.push({ a, b, cov });
  }
  const n = seg.length;
  const lmax = [];
  const rmax = [];
  for (let i = 0; i < n; i++) lmax[i] = Math.max(seg[i].cov, i ? lmax[i - 1] : 0);
  for (let i = n - 1; i >= 0; i--) rmax[i] = Math.max(seg[i].cov, i + 1 < n ? rmax[i + 1] : 0);
  // רצועה פנימית בלבד: דיו בקצה (מספר, סימן) אינו מרזב
  const low = seg.map((s, i) => i > 0 && i + 1 < n && s.cov < GUTTER_COVER * Math.min(lmax[i - 1], rmax[i + 1]));
  const cols = [];
  let start = xs[0];
  for (let i = 0; i < n; i++) {
    if (!low[i]) continue;
    let j = i;
    while (j + 1 < n && low[j + 1]) j++;
    cols.push([start, seg[i].a]);
    start = seg[j].b;
    i = j;
  }
  cols.push([start, xs[xs.length - 1]]);
  return cols.reverse();
}

// הטור של השורה (אינדקס ב-cols), או -1 לשורה חוצה
export function columnOf(line, cols) {
  if (!cols?.length) return -1;
  const b = line.bbox;
  const w = widthOf(b);
  if (!(w > 0)) return -1;
  const k = cols.findIndex((c) => overlapRange(b, c) >= IN_COLUMN * w);
  if (k < 0) return -1;
  for (let j = 0; j < cols.length; j++) {
    if (j === k) continue;
    const ov = overlapRange(b, cols[j]);
    // גלישה קטנה אל המרזב/הטור השכן (קצה-אות, תיבה רחבה מעט) אינה הופכת את השורה לחוצה
    if (ov > INTRUDE * (cols[j][1] - cols[j][0]) && ov > 0.1 * w) return -1;
  }
  return k;
}

// בדיקת-הזוגות (כמו _columns_of אצלם): בכל טור לפחות שתי שורות, ורוב שורות-הטורים עם שכנה
// באותו גובה בטור אחר — אחרת ה"טורים" הם שורות קצרות מפוזרות, לא עמוד דו-טורי
function pairedColumns(lines, cols) {
  const inCol = [];
  const count = cols.map(() => 0);
  for (const l of lines) {
    const k = columnOf(l, cols);
    if (k < 0) continue;
    inCol.push([l, k]);
    count[k]++;
  }
  if (count.some((c) => c < 2)) return false;
  let paired = 0;
  for (const [l, k] of inCol) {
    const mate = inCol.some(([q, j]) => j !== k && vOverlap(l.bbox, q.bbox) > 0.5 * Math.min(heightOf(l.bbox), heightOf(q.bbox)));
    if (mate) paired++;
  }
  return paired >= PAIRED * inCol.length;
}

function columnsFor(lines) {
  const cols = columnRanges(lines);
  if (cols.length > 1) return cols;
  // רוב הזרם ברוחב מלא (הן מכסות גם את המרזב) — מחפשים מרזב רק בשורות הצרות
  const ext = widthOf(union(lines.map((l) => l.bbox)));
  const narrow = lines.filter((l) => widthOf(l.bbox) <= NARROW * ext);
  if (narrow.length < MIN_NARROW) return cols;
  const alt = columnRanges(narrow);
  return alt.length > 1 && pairedColumns(narrow, alt) ? alt : cols;
}

// הקבוצות של זרם אחד בסדר-הקריאה שלו — כל קבוצה תהיה מסגרת
function streamGroups(lines) {
  const cols = columnsFor(lines);
  if (cols.length < 2) return [lines.slice()];
  const col = new Map(lines.map((l) => [l, columnOf(l, cols)]));
  const colLines = lines.filter((l) => col.get(l) >= 0);
  const bridging = lines.filter((l) => col.get(l) < 0).sort((a, b) => cy(a) - cy(b));
  const top = Math.min(...colLines.map(cy));
  const bottom = Math.max(...colLines.map(cy));

  const runs = [];
  for (const l of bridging) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    const between = prev && colLines.some((c) => cy(c) > cy(prev) && cy(c) < cy(l));
    if (last && !between) last.push(l);
    else runs.push([l]);
  }
  const spans = (l) => cols.filter((c) => overlapRange(l.bbox, c) >= SPAN * (c[1] - c[0])).length;
  const blocks = runs.filter((r) => {
    if (r.length >= 2 || isHeadingLine(r[0])) return true;
    const y = cy(r[0]);
    if (y < top) return true; // מעל כל הטורים — כותרת או פתיח
    if (y > bottom) return spans(r[0]) < 2; // שורת-סיום; פרושה על שני טורים — חיתוך שגוי
    return false; // באמצע — חיתוך שגוי
  });

  // מלמעלה למטה: שורות-הטורים שבין שני גושים הן רצועה; ברצועה — הטורים מימין לשמאל
  const items = [
    ...blocks.map((r) => ({ y: Math.min(...r.map(cy)), block: r })),
    ...colLines.map((l) => ({ y: cy(l), line: l })),
  ].sort((a, b) => a.y - b.y || (a.block ? -1 : 0) - (b.block ? -1 : 0));
  const groups = [];
  let band = [];
  const flush = () => {
    cols.forEach((_, k) => {
      const m = band.filter((l) => col.get(l) === k);
      if (m.length) groups.push(m);
    });
    band = [];
  };
  for (const it of items) {
    if (it.block) {
      flush();
      groups.push(it.block);
    } else band.push(it.line);
  }
  flush();
  return groups;
}

const minOrder = (ls) => {
  const o = ls.map((l) => l.order).filter(Number.isFinite);
  return o.length ? Math.min(...o) : Infinity;
};

// ההצעה: [{fid, stream, bbox, seq, order}] — seq בזרם-הבסיס (כותרת נספרת בזרם שלה),
// order = 1..n בעמוד. newFid(taken) נותן מזהה-מסגרת.
export function autoFrames(doc, newFid) {
  const lines = (doc?.lines || []).filter(
    (l) =>
      l &&
      isBox(l.bbox) &&
      widthOf(l.bbox) > 0 &&
      heightOf(l.bbox) > 0 &&
      l.status !== 'removed' &&
      !FURNITURE_STREAMS.includes(baseOf(l.stream))
  );
  const byStream = new Map();
  for (const l of lines) {
    const s = baseOf(l.stream);
    if (!byStream.has(s)) byStream.set(s, []);
    byStream.get(s).push(l);
  }

  const frames = [];
  for (const [stream, ls] of byStream) {
    streamGroups(ls).forEach((g, k) => {
      const heading = g.every(isHeadingLine) ? headingStream(stream) : null;
      frames.push({ base: stream, stream: heading || stream, bbox: union(g.map((l) => l.bbox)), seq: k + 1, rank: minOrder(g) });
    });
  }

  // בין הזרמים — לפי סדר-הקריאה של המחשב (בלעדיו: ראש המסגרת, ואז מימין לשמאל)
  frames.sort((a, b) => a.rank - b.rank || a.bbox[1] - b.bbox[1] || b.bbox[2] - a.bbox[2]);
  // בתוך כל זרם — לפי seq
  const slots = new Map();
  frames.forEach((f, i) => {
    if (!slots.has(f.base)) slots.set(f.base, []);
    slots.get(f.base).push(i);
  });
  const ordered = frames.slice();
  for (const idx of slots.values()) {
    const members = idx.map((i) => frames[i]).sort((a, b) => a.seq - b.seq);
    idx.forEach((slot, k) => {
      ordered[slot] = members[k];
    });
  }

  const taken = new Set();
  return ordered.map((f, i) => {
    const fid = newFid(taken);
    taken.add(fid);
    return { fid, stream: f.stream, bbox: f.bbox, seq: f.seq, order: i + 1 };
  });
}

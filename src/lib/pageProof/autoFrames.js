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
// 3. מלמעלה למטה העמוד מתחלק לרצפים, לסירוגין: שורות-טור רצופות (בלי שורה חוצה ביניהן) ושורות
//    חוצות רצופות. שורה שנחתכה לשני חצאים, ואחד מהם נכנס עמוק אל הטור השני, היא שורה חוצה — גם
//    כשהיא צמודה לשורה הראשונה או האחרונה של הטורים. רצף-טורים קטן (עד שתי שורות בטור) בתוך טקסט
//    על כל הרוחב אינו אזור דו-טורי אלא חלק מהטקסט הזה, ומצטרף לגוש שלו: שורה קצרה (סוף פסקה), או
//    שורה אחת שנחתכה לשני חצאים (החצאים נוגעים זה בזה, או שאחד מהם עובר את המרזב); בתוך
//    מסגרת-הגוש החצאים נקראים במקומם, מימין לשמאל. שורה שממלאת את הטור וזוג-טורים אמיתי (חלק בכל
//    טור, ובמרזב רווח לבן) מצטרפים רק לגושים של כמה שורות (הפירוט — ב-absorbStrays). כך שורה
//    מתחת לסוף האזור הדו-טורי (או מעל תחילתו) אינה נכנסת למסגרות-הטורים ואינה מותחת אותן אל תוך
//    הטקסט שעל כל הרוחב.
// 4. רצף חוצה של 2+ שורות, כותרת, רצף מעל כל הטורים, ושורת-סיום מתחתיהם שאינה פרושה על שני
//    טורים — מסגרת משלהם, שמחלקת את הטורים לרצועות. שורה חוצה בודדת בין שני רצפי-טורים היא
//    כנראה חיתוך שגוי: נשארת מחוץ למסגרות ובולטת מהן (מתקנים אותה במצב "שורות" ← פיצול) — כך
//    היא לא מאחדת את שני הטורים למסגרת אחת, וגם לא שוברת אותם.
// 5. פס ריק גבוה מ-GAP שורות — לרוחב כל הרצועה (או הגוש) שובר אותה לשתיים; בטור אחד בלבד — שובר
//    רק את הטור. כך מסגרת אינה נמתחת על שטח ריק (איור, רווח גדול) בין שני חלקי טקסט.
// 6. מסגרת שכל שורותיה כותרת — בזרם-הכותרת (רק כשתוכנת-הספר מכירה אותו).
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
// רצף-טורים "קטן": עד כמה שורות בכל טור — רצף כזה בתוך טקסט על כל הרוחב יכול להיות חלק ממנו
export const STRAY_ROWS = 2;
// שורה "ממלאת את הטור": לפחות החלק הזה מרוחבו (שורת-טור מיושרת — לא סוף-פסקה קצר)
export const FILL = 0.85;
// חלק-שורה שנכנס אל טור שכן יותר מהחלק הזה מרוחבו (אבל פחות מ-INTRUDE, ולכן עדיין "בטור") —
// חצי של שורה שנחתכה לשניים, כשבאותו גובה יש חלק גם בטור השכן
export const PEEL = 0.1;
// פס ריק גבוה מכמה שורות (גובה-שורה חציוני בזרם) שובר מסגרת לשתיים
export const GAP = 2;

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const baseOf = (s) => String(s || 'main').replace(/_heading$/, '') || 'main';
const isHeadingLine = (l) => String(l?.stream || '').endsWith('_heading');
const cy = (l) => (l.bbox[1] + l.bbox[3]) / 2;
const widthOf = (b) => b[2] - b[0];
const heightOf = (b) => b[3] - b[1];
const overlapRange = (b, [a, c]) => Math.max(0, Math.min(b[2], c) - Math.max(b[0], a));
const vOverlap = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
// שתי שורות באותו גובה: חופפות לגובה ביותר ממחצית הנמוכה שבהן
const sameRow = (a, b) => vOverlap(a.bbox, b.bbox) > 0.5 * Math.min(heightOf(a.bbox), heightOf(b.bbox));
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[(s.length - 1) >> 1] : 0;
};
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
    if (inCol.some(([q, j]) => j !== k && sameRow(l, q))) paired++;
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

// גובה-שורה טיפוסי בזרם: החציון, בלי כתמים (תיבה שאינה רחבה לפחות פי שניים מגובהה)
function lineHeight(lines) {
  const text = lines.filter((l) => widthOf(l.bbox) >= 2 * heightOf(l.bbox));
  return median((text.length ? text : lines).map((l) => heightOf(l.bbox)));
}

// קבוצה ← החלקים הרציפים שלה לגובה: פס ריק גבוה מ-gap בין שורה לשורה שובר אותה. fill — שורות
// שאינן בקבוצה אבל ממלאות את הגובה שלהן (שורת חיתוך-שגוי בתוך רצועה אינה "פס ריק")
function splitAtGaps(group, gap, fill = []) {
  const items = [...group.map((l) => [l, true]), ...fill.map((l) => [l, false])].sort((a, b) => a[0].bbox[1] - b[0].bbox[1]);
  const out = [];
  let cur = [];
  let bottom = -Infinity;
  for (const [l, own] of items) {
    if (cur.length && l.bbox[1] - bottom > gap) {
      out.push(cur);
      cur = [];
    }
    if (own) cur.push(l);
    bottom = Math.max(bottom, l.bbox[3]);
  }
  if (cur.length) out.push(cur);
  return out;
}

// מלמעלה למטה: רצפים של שורות-טור (inCol) ושל שורות חוצות, לסירוגין. חלק-שורה בטור שבגובה של
// שורה חוצה (שורה אחת שנחתכה לשני חלקים) נספר מיד אחריה — ולא נדבק לרצף-הטורים שמעליה
function verticalRuns(lines, col) {
  const crossing = (l) => (col.get(l) < 0 ? 1 : 0);
  const cross = lines.filter(crossing);
  const key = new Map(
    lines.map((l) => {
      const mates = crossing(l) ? [] : cross.filter((q) => sameRow(q, l));
      return [l, Math.max(cy(l), ...mates.map(cy))];
    })
  );
  const sorted = lines.slice().sort((a, b) => key.get(a) - key.get(b) || crossing(b) - crossing(a));
  const runs = [];
  for (const l of sorted) {
    const inCol = !crossing(l);
    const last = runs[runs.length - 1];
    if (last && last.inCol === inCol) last.lines.push(l);
    else runs.push({ inCol, lines: [l] });
  }
  return runs;
}

// אשכולות של שורות באותו גובה
function rowsOf(ls) {
  const rows = [];
  for (const l of ls) {
    const row = [l];
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].some((q) => sameRow(q, l))) row.push(...rows.splice(i, 1)[0]);
    rows.push(row);
  }
  return rows;
}

// שורה שנחתכה לשני חלקים ונדבקה לקצה של רצף-טורים (השורה הראשונה או האחרונה שלו): חלקים ביותר
// מטור אחד, ואחד מהם נכנס עמוק (PEEL) אל טור שכן שיש בו חלק אחר של אותה שורה. היא שורה חוצה —
// לא זוג-טורים: הופכים את חלקיה ל"חוצים", והקצה הבא של הרצף נבדק שוב
function peelSplitEdges(lines, col, cols) {
  const deep = (l, ks) => [...ks].some((j) => j !== col.get(l) && overlapRange(l.bbox, cols[j]) > PEEL * (cols[j][1] - cols[j][0]));
  const split = (row) => {
    const ks = new Set(row.map((l) => col.get(l)));
    return ks.size > 1 && row.some((l) => deep(l, ks));
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of verticalRuns(lines, col)) {
      if (!r.inCol) continue;
      const rows = rowsOf(r.lines).sort((a, b) => Math.min(...a.map(cy)) - Math.min(...b.map(cy)));
      for (const row of new Set([rows[0], rows[rows.length - 1]])) {
        if (!split(row)) continue;
        for (const l of row) col.set(l, -1);
        changed = true;
      }
    }
  }
}

// האם הקטעים האופקיים של השורות מכסים יחד את [a, b] כולו
function covers(ls, a, b) {
  let pos = a;
  for (const l of ls.slice().sort((p, q) => p.bbox[0] - q.bbox[0])) {
    if (l.bbox[0] > pos) break;
    pos = Math.max(pos, l.bbox[2]);
  }
  return pos >= b;
}

// שורה (חלקים באותו גובה) שבין הטור הימני שלה לשמאלי נשאר מרזב פתוח — רווח לבן בתוך המרזב —
// היא זוג-טורים אמיתי. המרזב בין טור k (מימין) לטור k+1 (משמאל): [הקצה הימני של k+1, השמאלי של k]
function openGutter(row, col, cols) {
  const ks = row.map((l) => col.get(l));
  const i = Math.min(...ks);
  const j = Math.max(...ks);
  for (let k = i; k < j; k++) if (!covers(row, cols[k + 1][1], cols[k][0])) return true;
  return false;
}

// רצף-טורים קטן — עד STRAY_ROWS שורות בכל טור; מה יש בו:
//   'split'  — שורה שחלקיה מכסים את המרזב: שורה אחת שנחתכה לשניים (החלקים נוגעים זה בזה, או שאחד
//              מהם עובר את המרזב אל הטור השני);
//   'pair'   — שורה אחת בלבד, והיא נראית זוג-טורים אמיתי: חלק בכל טור, ובמרזב שביניהם רווח לבן;
//   'column' — שורות בטור (לא באותו גובה בשני טורים), ואחת מהן לפחות ממלאת את הטור — רחבה כמעט
//              כמו שורה טיפוסית בו (typical: טור ← רוחב-שורה טיפוסי, ראו absorbStrays);
//   'short'  — רק שורות קצרות (סוף-פסקה).
// null — אזור דו-טורי: יותר מ-STRAY_ROWS שורות בטור, או יותר משורה אחת ובהן זוג-טורים אמיתי.
function weakRun(ls, col, cols, typical) {
  const count = new Map();
  for (const l of ls) count.set(col.get(l), (count.get(col.get(l)) || 0) + 1);
  const most = Math.max(...count.values());
  if (most > STRAY_ROWS) return null;
  let split = false;
  for (const row of rowsOf(ls)) {
    if (openGutter(row, col, cols)) return most === 1 ? 'pair' : null;
    if (new Set(row.map((l) => col.get(l))).size > 1) split = true;
  }
  if (split) return 'split';
  return ls.some((l) => widthOf(l.bbox) >= FILL * typical.get(col.get(l))) ? 'column' : 'short';
}

// רצף-טורים קטן בתוך טקסט על כל הרוחב מצטרף לטקסט שלצדו (ואינו נעשה רצועה של מסגרות-טור):
// • חצאי-שורה — לכל גוש-טקסט שנוגע בהם;
// • סוף-פסקה קצר — כשיש טקסט משני צדדיו, או כשלצדו גוש של כמה שורות;
// • שורה שממלאת את הטור, וזוג שנראה אמיתי בשורה אחת — רק לגושים של כמה שורות, ולא כשלצדם שורה
//   חוצה בודדת: זו כנראה שורה של הטורים שנחתכה על פני שניהם, ומה שאחריה — המשך הטורים. ליד גוש
//   של כמה שורות "זוג" כזה הוא כמעט תמיד שורה שנחתכה בדיוק במרזב (למשל "מרזב-דמה" של חיתוך
//   בכרטיס); וגם כשלא — בשורה אחת סדר-הקריאה זהה (החלק הימני ואחריו השמאלי).
// כותרת אינה "טקסט" לעניין זה: מה שמצטרף אליה היה מוציא אותה מזרם-הכותרת.
function absorbStrays(runs, col, cols) {
  const text = (r) => (r && !r.inCol && r.lines.some((l) => !isHeadingLine(l)) ? r : null);
  const solid = (r) => !!r && r.lines.length > 1;
  // רוחב-שורה טיפוסי בכל טור: החציון של שורות-הטור שיש להן זוג אמיתי בטור שכן (לא שורות קצרות
  // מפוזרות, ולא גבולות הטור — שורה מבולגנת מרחיבה אותם); בלי זוגות כאלה — רוחב הטור
  const inCol = runs.filter((r) => r.inCol).flatMap((r) => r.lines);
  const paired = inCol.filter((a) => inCol.some((b) => col.get(b) !== col.get(a) && sameRow(a, b) && openGutter([a, b], col, cols)));
  const typical = new Map(
    cols.map((c, k) => {
      const ws = paired.filter((l) => col.get(l) === k).map((l) => widthOf(l.bbox));
      return [k, ws.length ? median(ws) : c[1] - c[0]];
    })
  );
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const kind = r.inCol ? weakRun(r.lines, col, cols, typical) : null;
    if (!kind) continue;
    const up = text(runs[i - 1]);
    const down = text(runs[i + 1]);
    const ok =
      kind === 'split'
        ? up || down
        : kind === 'short'
          ? (up && down) || solid(up) || solid(down)
          : (up || down) && [up, down].every((x) => !x || solid(x)); // 'column' / 'pair'
    if (!ok) continue;
    if (up && down) {
      up.lines.push(...r.lines, ...down.lines);
      runs.splice(i, 2);
    } else {
      if (up) up.lines.push(...r.lines);
      else down.lines.unshift(...r.lines);
      runs.splice(i, 1);
    }
    i--;
  }
}

// הקבוצות של זרם אחד בסדר-הקריאה שלו — כל קבוצה תהיה מסגרת
function streamGroups(lines) {
  const gap = GAP * lineHeight(lines);
  const cols = columnsFor(lines);
  if (cols.length < 2) return splitAtGaps(lines, gap);
  const col = new Map(lines.map((l) => [l, columnOf(l, cols)]));
  peelSplitEdges(lines, col, cols);
  const runs = verticalRuns(lines, col);
  absorbStrays(runs, col, cols);

  // רצועות (שורות-טור) וגושים (שורות חוצות), מלמעלה למטה
  const spans = (l) => cols.filter((c) => overlapRange(l.bbox, c) >= SPAN * (c[1] - c[0])).length;
  const sections = [];
  let open = null; // רצועה שממשיכה אחרי שורת חיתוך-שגוי
  runs.forEach((r, i) => {
    if (r.inCol) {
      if (open) open.band.push(...r.lines);
      else sections.push({ band: r.lines.slice(), cut: [] });
      open = null;
      return;
    }
    const [l] = r.lines;
    if (r.lines.length > 1 || isHeadingLine(l)) {
      sections.push({ block: r.lines });
      return;
    }
    const up = runs[i - 1]?.inCol;
    const down = runs[i + 1]?.inCol;
    if (up && down) {
      // באמצע — חיתוך שגוי: בחוץ, והטורים שמעליה ומתחתיה באותה רצועה
      open = sections[sections.length - 1];
      open.cut.push(l);
    } else if (!up || spans(l) < 2) {
      // מעל כל הטורים — כותרת או פתיח; שורת-סיום (פרושה על שני טורים — חיתוך שגוי, בחוץ)
      sections.push({ block: r.lines });
    }
  });

  // ברצועה — הטורים מימין לשמאל; פס ריק לרוחב כל הרצועה שובר אותה, ובטור — רק את הטור
  const groups = [];
  for (const s of sections) {
    if (s.block) {
      groups.push(...splitAtGaps(s.block, gap));
      continue;
    }
    for (const band of splitAtGaps(s.band, gap, s.cut)) {
      cols.forEach((_, k) => {
        const m = band.filter((l) => col.get(l) === k);
        if (m.length) groups.push(...splitAtGaps(m, gap, s.cut));
      });
    }
  }
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

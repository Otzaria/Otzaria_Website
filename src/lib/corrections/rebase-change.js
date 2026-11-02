/**
 * מיזוג תלת-כיווני ברמת מילים: מחיל על השורה העדכנית בגיטהאב (current) רק את ההבדלים
 * שהמשתמש דיווח (reportedOriginal → reportedNew). כל מה שהשתנה בגיטהאב בינתיים נשאר כפי שהוא.
 *
 * טהור (בלי DOM/רשת) — משמש את מסך הטיפול בדיווח ואת הטסט הצמוד.
 */

const TOKEN_RE = /[\p{L}\p{N}\p{M}]+|\s+|[^\p{L}\p{N}\p{M}\s]/gu;
const MAX_CELLS = 30_000_000;

export function tokenize(s) {
  return String(s ?? '').match(TOKEN_RE) || [];
}

/** LCS בין שתי רשימות; מחזיר זוגות [i, j] תואמים בסדר עולה, או null אם הקלט גדול מדי. */
function matchPairs(a, b) {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let ea = a.length;
  let eb = b.length;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const n = ea - lo;
  const m = eb - lo;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;
  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = a[lo + i] === b[lo + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  const pairs = [];
  for (let i = 0; i < lo; i++) pairs.push([i, i]);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[lo + i] === b[lo + j]) { pairs.push([lo + i, lo + j]); i++; j++; }
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
    else j++;
  }
  for (let k = 0; k < a.length - ea; k++) pairs.push([ea + k, eb + k]);
  return pairs;
}

/**
 * @returns {{line:string, applied:number, skipped:number, conflicts:number, clean:boolean}}
 *  applied — תיקונים שהוחלו; skipped — כבר מתוקנים בגיטהאב; conflicts — לא ניתן למקם (נשארו כמו בגיטהאב).
 *  clean=false כשהמיזוג לא אפשרי כלל (קלט ענק) ולכן הוחזרה current ללא שינוי.
 */
export function rebaseLineChange(reportedOriginal, reportedNew, current) {
  if (current === reportedOriginal) return { line: reportedNew, applied: 1, skipped: 0, conflicts: 0, clean: true };
  if (current === reportedNew) return { line: current, applied: 0, skipped: 1, conflicts: 0, clean: true };

  const base = tokenize(reportedOriginal);
  const mine = tokenize(reportedNew);
  const cur = tokenize(current);
  const bm = matchPairs(base, mine);
  const bc = matchPairs(base, cur);
  if (!bm || !bc) return { line: current, applied: 0, skipped: 0, conflicts: 0, clean: false };

  // base → current (או -1 אם המילה שונתה/נמחקה בגיטהאב)
  const toCur = new Array(base.length).fill(-1);
  for (const [i, j] of bc) toCur[i] = j;

  // הנקודות שבהן base ו-mine שונים = "הצ'אנקים" של המשתמש
  const hunks = [];
  let pi = 0;
  let pj = 0;
  for (const [i, j] of [...bm, [base.length, mine.length]]) {
    if (i > pi || j > pj) hunks.push({ s: pi, e: i, repl: mine.slice(pj, j) });
    pi = i + 1;
    pj = j + 1;
  }

  const curText = current;
  const edits = [];
  let applied = 0;
  let skipped = 0;
  let conflicts = 0;
  for (const h of hunks) {
    const replText = h.repl.join('');
    let range = null;
    if (h.e > h.s) {
      let ok = true;
      for (let i = h.s; i < h.e; i++) {
        if (toCur[i] === -1 || (i > h.s && toCur[i] !== toCur[i - 1] + 1)) { ok = false; break; }
      }
      if (ok) range = [toCur[h.s], toCur[h.e - 1] + 1];
    } else {
      const left = h.s === 0 ? 0 : toCur[h.s - 1] === -1 ? null : toCur[h.s - 1] + 1;
      const right = h.s === base.length ? cur.length : toCur[h.s] === -1 ? null : toCur[h.s];
      if (left !== null && right !== null) { if (left === right) range = [left, left]; }
      else if (left !== null || right !== null) range = [left ?? right, left ?? right];
    }
    if (range) { edits.push({ from: range[0], to: range[1], repl: h.repl }); applied++; }
    else if (replText && curText.includes(replText)) skipped++;
    else conflicts++;
  }

  const out = cur.slice();
  edits.sort((a, b) => b.from - a.from);
  for (const e of edits) out.splice(e.from, e.to - e.from, ...e.repl);
  return { line: out.join(''), applied, skipped, conflicts, clean: true };
}

/**
 * כלי diff/patch ברמת שורה עבור מרחב העריכה.
 *
 * מודל ה-"hunk":  { line, before, after }
 *   line   = אינדקס השורה (0-based) בטקסט הישן שבו מתחיל ההבדל (רמז מיקום)
 *   before = בלוק השורות הישן (מחובר ב-\n)
 *   after  = בלוק השורות החדש (מחובר ב-\n)
 *
 * עיקרון מפתח: היישום (applyHunks) מאתר את before בטקסט הנוכחי לפי תוכן (לא לפי
 * אינדקס בלבד), כך שתיקון נשאר ישים גם אם שורות אחרות זזו. לכן הדיף מבטיח ש-before
 * לעולם אינו ריק (הוספות מעוגנות לשורת הקשר), כדי שתמיד יהיה מה לאתר.
 */

const MAX_DP_CELLS = 4_000_000; // מעל זה — hunk גס אחד במקום LCS עדין

export function splitLines(text) {
  return String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
}

export function joinLines(lines) {
  return lines.join('\n');
}

/** LCS table (Needleman) על מערכי שורות קטנים. מחזיר את אורך ה-LCS לכל (i,j). */
function lcsTable(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/**
 * מחשב רשימת hunks בין oldText ל-newText.
 * @returns {Array<{line:number, before:string, after:string}>}
 */
export function diffToHunks(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const sourceText = a.join('\n'); // לבדיקת ייחודיות העוגן

  // 1. קיצוץ קידומת משותפת
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;

  // 2. קיצוץ סיומת משותפת
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA + 1); // שורות ישנות שהשתנו
  const midB = b.slice(start, endB + 1); // שורות חדשות

  if (midA.length === 0 && midB.length === 0) return []; // זהים

  // 3. אם האזור השונה גדול מדי ל-LCS — hunk גס אחד
  if (midA.length * midB.length > MAX_DP_CELLS) {
    return [anchorHunk(a, start, midA, midB, sourceText)];
  }

  // 4. LCS עדין על האזור השונה → hunks
  const dp = lcsTable(midA, midB);
  const hunks = [];
  let i = 0, j = 0;
  let curOld = [], curNew = [], hunkStart = start;

  const flush = () => {
    if (curOld.length === 0 && curNew.length === 0) return;
    hunks.push(anchorHunk(a, hunkStart, curOld, curNew, sourceText));
    curOld = [];
    curNew = [];
  };

  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      flush();
      i++; j++;
      hunkStart = start + i;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      if (curOld.length === 0 && curNew.length === 0) hunkStart = start + i;
      curOld.push(midA[i++]);
    } else {
      if (curOld.length === 0 && curNew.length === 0) hunkStart = start + i;
      curNew.push(midB[j++]);
    }
  }
  while (i < midA.length) { if (curOld.length === 0 && curNew.length === 0) hunkStart = start + i; curOld.push(midA[i++]); }
  while (j < midB.length) { if (curOld.length === 0 && curNew.length === 0) hunkStart = start + i; curNew.push(midB[j++]); }
  flush();

  return hunks;
}

const MAX_WORD_DIFF_TOKENS = 1500; // מעל זה — לא מפרקים למילים (יקר מדי), מחזירים בלוק אחד

/**
 * diff ברמת המילה בין שני בלוקי טקסט, לצורך הדגשה ויזואלית של מה שהשתנה בתוך השורה.
 * מחזיר רצף מקטעים: { type: 'equal' | 'del' | 'add', text }
 *   equal = ללא שינוי, del = הוסר מ-before, add = נוסף ב-after.
 * הטוקניזציה שומרת על רווחים/ירידות שורה כטוקנים נפרדים, כך שהשחזור מדויק.
 */
export function diffWords(before, after) {
  const tokenize = (s) => String(s == null ? '' : s).match(/\s+|\S+/g) || [];
  const a = tokenize(before);
  const b = tokenize(after);

  // הגנת ביצועים: בלוקים ענקיים — לא מפרקים, מסמנים הכל כשינוי גס
  if (a.length * b.length > MAX_WORD_DIFF_TOKENS * MAX_WORD_DIFF_TOKENS) {
    const segs = [];
    if (a.length) segs.push({ type: 'del', text: a.join('') });
    if (b.length) segs.push({ type: 'add', text: b.join('') });
    return segs;
  }

  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments = [];
  const push = (type, text) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += text;
    else segments.push({ type, text });
  };

  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('equal', a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', a[i++]); }
    else { push('add', b[j++]); }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);

  return segments;
}

/**
 * מצמצם בלוק before/after לחלון סביב אזור השינוי בלבד (לתצוגה מקדימה), כדי שלא
 * יוצג רק *תחילת* הקטע כשהשינוי עמוק בתוכו. שומר ~context תווים מכל צד של אזור
 * השינוי ומסמן קיצוץ ב-'…'. ההקשר השמור (קידומת/סיומת משותפת) זהה בשני הצדדים,
 * כך שהדגשת המילים בלקוח עדיין מסמנת אך ורק את מה שבאמת השתנה.
 * @returns {{before:string, after:string}}
 */
export function focusChange(before, after, { context = 140, maxChanged = 1200 } = {}) {
  const a = String(before == null ? '' : before);
  const b = String(after == null ? '' : after);
  const minLen = Math.min(a.length, b.length);

  let p = 0;
  while (p < minLen && a[p] === b[p]) p++;
  let s = 0;
  while (s < minLen - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;

  if (p === a.length && p === b.length) return { before: a, after: b }; // זהים

  const window = (str) => {
    const cs = p;                       // תחילת השינוי
    const ce = str.length - s;          // סוף השינוי (לא כולל)
    const leadStart = Math.max(0, cs - context);
    const trailEnd = Math.min(str.length, ce + context);
    const head = str.slice(leadStart, cs);
    let mid = str.slice(cs, ce);
    if (mid.length > maxChanged) mid = mid.slice(0, maxChanged) + ' … '; // שינוי ענק — קיצוץ באמצע
    const tail = str.slice(ce, trailEnd);
    return (leadStart > 0 ? '…' : '') + head + mid + tail + (trailEnd < str.length ? '…' : '');
  };

  return { before: window(a), after: window(b) };
}

const MAX_CONTEXT_LINES = 6;

/**
 * בונה hunk מעוגן לשורות הקשר סמוכות, כך שגבולות ה-newline נשמרים גם במחיקה/הוספה.
 * מרחיב את ההקשר (שורות נוספות מסביב) עד ש-before ייחודי במסמך המקור — כך שורות
 * קצרות/ריקות/חוזרות (כותרות, מעברי פסקה) לא יגרמו לאי-ודאות (ambiguous) ביישום.
 * ההרחבה בטוחה: לעולם לא "מנחשת" מיקום, רק מוסיפה הקשר ודאי.
 */
function anchorHunk(a, oldStart, oldLines, newLines, sourceText) {
  const blockEnd = oldStart + oldLines.length; // אינדקס השורה שאחרי הבלוק
  const hasPrev = oldStart > 0;
  const hasNext = blockEnd < a.length;

  // הבלוק מכסה את כל הקובץ (או קובץ ריק) — אין הקשר לעגן אליו
  if (!hasPrev && !hasNext) {
    return { line: oldStart, before: joinLines(oldLines), after: joinLines(newLines) };
  }

  let lead = hasPrev ? 1 : 0;
  let trail = !hasPrev && hasNext ? 1 : 0; // אם אין שורה קודמת — מתחילים מהשורה הבאה

  const build = () => {
    const preStart = oldStart - lead;
    const pre = a.slice(preStart, oldStart);
    const post = a.slice(blockEnd, blockEnd + trail);
    return {
      line: preStart,
      before: joinLines([...pre, ...oldLines, ...post]),
      after: joinLines([...pre, ...newLines, ...post]),
    };
  };

  const appearsTwice = (s) => {
    const first = sourceText.indexOf(s);
    return first !== -1 && sourceText.indexOf(s, first + 1) !== -1;
  };

  let h = build();
  let guard = 0;
  while (appearsTwice(h.before) && guard++ < MAX_CONTEXT_LINES) {
    if (oldStart - lead > 0) lead++;          // עדיפות להרחבה כלפי מעלה
    else if (blockEnd + trail < a.length) trail++;
    else break;                                // אי אפשר להרחיב יותר
    h = build();
  }

  return { line: h.line, before: h.before, after: h.after };
}

/**
 * מיזוג 3-way: בסיס (אב משותף), "שלנו" (עריכות האתר), "שלהם" (גיטהאב כעת).
 *
 * הרעיון: מחילים את עריכותינו (base→ours) מעל "שלהם" באמצעות איתור-תוכן.
 * אם עריכה שלנו נוגעת באזור שגם הם שינו — ה-before שלה לא יימצא → קונפליקט.
 * עריכות באזורים שונים מתמזגות; עריכות זהות בשני הצדדים מתמזגות אידמפוטנטית.
 *
 * @returns {{merged:string, conflicts:Array, clean:boolean}}
 */
export function threeWayMerge(base, ours, theirs) {
  const b = String(base == null ? '' : base).replace(/\r\n/g, '\n');
  const o = String(ours == null ? '' : ours).replace(/\r\n/g, '\n');
  const t = String(theirs == null ? '' : theirs).replace(/\r\n/g, '\n');

  if (o === t) return { merged: o, conflicts: [], clean: true };       // הסכמה
  if (o === b) return { merged: t, conflicts: [], clean: true };       // רק הם שינו
  if (t === b) return { merged: o, conflicts: [], clean: true };       // רק אנחנו שינינו

  const ourHunks = diffToHunks(b, o);
  const { content: merged, conflicts } = applyHunks(t, ourHunks);
  return { merged, conflicts, clean: conflicts.length === 0 };
}

/**
 * מיישם רשימת hunks על טקסט נוכחי, לפי איתור תוכן (resilient לתזוזת שורות).
 * @returns {{content:string, applied:number, conflicts:Array}}
 *   conflicts = hunks ש-before שלהם לא נמצא (או נמצא ביותר ממקום אחד באופן מעורפל)
 */
export function applyHunks(currentText, hunks) {
  const conflicts = [];
  let applied = 0;
  let text = String(currentText == null ? '' : currentText).replace(/\r\n/g, '\n');

  for (const hunk of hunks) {
    if (hunk.before === hunk.after) { applied++; continue; }

    if (hunk.before === '') {
      // הוספה לקובץ ריק
      if (text === '') { text = hunk.after; applied++; }
      else conflicts.push(hunk);
      continue;
    }

    const first = text.indexOf(hunk.before);
    if (first === -1) {
      // אולי כבר הוחל (after כבר קיים) — נחשיב כהצלחה אידמפוטנטית
      if (hunk.after !== '' && text.indexOf(hunk.after) !== -1) { applied++; }
      else conflicts.push(hunk);
      continue;
    }

    // כבר הוחל? בהוספה (after מכיל את before כתחילית) ה-before ימשיך להימצא גם אחרי
    // ההחלה, ויישום חוזר היה משכפל את התוספת. אם הטקסט במיקום זה כבר תואם ל-after —
    // דילוג אידמפוטני. התנאי on-length מונע טריגר-שווא במחיקות (after קצר מ-before).
    if (hunk.after.length >= hunk.before.length && text.startsWith(hunk.after, first)) {
      applied++;
      continue;
    }

    const second = text.indexOf(hunk.before, first + 1);
    if (second !== -1) {
      // מעורפל — יותר מהתאמה אחת; לא נחליף באופן עיוור
      conflicts.push({ ...hunk, ambiguous: true });
      continue;
    }

    text = text.slice(0, first) + hunk.after + text.slice(first + hunk.before.length);
    applied++;
  }

  return { content: text, applied, conflicts };
}

/**
 * diff לתצוגה: ברמת מילה (diffWords הקיים), ובתוך זוג מילים שהוחלפו — ברמת תו לפי
 * גרפמות (אות+ניקוד+טעמים יחד), כדי לא לפצל אות מהניקוד שלה. פלט = טקסט בלבד.
 */
import { diffWords } from '../dicta/text-diff.js';

const MAX_GRAPHEMES = 400;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('he', { granularity: 'grapheme' }) : null;

export function graphemes(s) {
  if (!segmenter) return Array.from(s);
  return Array.from(segmenter.segment(s), (g) => g.segment);
}

function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  const push = (type, text) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('equal', a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', a[i++]);
    else push('add', b[j++]);
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  return out;
}

/** diff גרפמות בין שני קטעים קצרים; ארוכים מדי — בלוק אחד. */
export function diffGraphemes(before, after) {
  const a = graphemes(before);
  const b = graphemes(after);
  if (a.length > MAX_GRAPHEMES || b.length > MAX_GRAPHEMES) {
    return [...(before ? [{ type: 'del', text: before }] : []), ...(after ? [{ type: 'add', text: after }] : [])];
  }
  return lcsDiff(a, b);
}

/**
 * @returns {Array<{type:'equal'|'del'|'add'|'change', text?:string, before?:Array, after?:Array}>}
 * change = מילה שהוחלפה, עם פירוט תווים לכל צד.
 */
export function buildDiffView(before, after) {
  const words = diffWords(before ?? '', after ?? '');
  const out = [];
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const next = words[k + 1];
    if (w.type === 'del' && next?.type === 'add') {
      const chars = diffGraphemes(w.text, next.text);
      out.push({
        type: 'change',
        before: chars.filter((c) => c.type !== 'add'),
        after: chars.filter((c) => c.type !== 'del'),
      });
      k++;
    } else {
      out.push({ type: w.type, text: w.text });
    }
  }
  return out;
}

const INVISIBLE = { '\u00a0': '⍽', '\u200f': '‹RLM›', '\u200e': '‹LRM›', '\t': '⇥', '\u200b': '‹ZWSP›', '\ufeff': '‹BOM›' };
const INVISIBLE_RE = /[\u00a0\u200f\u200e\t\u200b\ufeff]/g;

/** מחליף תווים בלתי נראים בסימן גלוי (לתצוגת שינויים בלבד). */
export function revealInvisible(text) {
  return String(text).replace(INVISIBLE_RE, (c) => INVISIBLE[c]);
}

export function hasInvisible(text) {
  INVISIBLE_RE.lastIndex = 0;
  return INVISIBLE_RE.test(String(text));
}

/**
 * פירוק שורה שהוסרה ושורה שנוספה לחלקים מודגשים: level 0 = זהה, 1 = בתוך מילה שהוחלפה,
 * 2 = התו/המילה שהשתנו בפועל. חיבור החלקים מחזיר בדיוק את השורה.
 */
export function lineDiffParts(before, after) {
  const removed = [];
  const added = [];
  const push = (arr, text, level) => {
    if (!text) return;
    const last = arr[arr.length - 1];
    if (last && last.level === level) last.text += text;
    else arr.push({ text, level });
  };
  for (const s of buildDiffView(before, after)) {
    if (s.type === 'equal') { push(removed, s.text, 0); push(added, s.text, 0); }
    else if (s.type === 'del') push(removed, s.text, 2);
    else if (s.type === 'add') push(added, s.text, 2);
    else {
      for (const c of s.before) push(removed, c.text, c.type === 'equal' ? 1 : 2);
      for (const c of s.after) push(added, c.text, c.type === 'equal' ? 1 : 2);
    }
  }
  return { removed, added };
}

/**
 * מודל תצוגת diff בסגנון סקירת קוד: הקשר מהקובץ (אם אותר בוודאות), שורה שהוסרה ושורה שנוספה.
 * context = extractLineContext של אותו blob; null → רק שורות הדיווח, בלי מספרי שורות מנוחשים.
 */
export function buildUnifiedRows({ context, lineIndex, originalLine, newLine }) {
  const hasFileContext = Boolean(context) && Number.isSafeInteger(lineIndex) && context.firstLineIndex + context.before.length === lineIndex;
  const lineNumber = hasFileContext ? lineIndex + 1 : null;
  const rows = [];
  if (hasFileContext) context.before.forEach((text, i) => rows.push({ kind: 'context', lineNumber: context.firstLineIndex + i + 1, marker: ' ', text }));
  const noProposal = typeof newLine !== 'string';
  if (noProposal) {
    rows.push({ kind: 'reported', lineNumber, marker: ' ', text: originalLine ?? '', parts: [{ text: originalLine ?? '', level: 0 }] });
  } else {
    const { removed, added } = lineDiffParts(originalLine ?? '', newLine);
    rows.push({ kind: 'removed', lineNumber, marker: '−', text: originalLine ?? '', parts: removed });
    rows.push({ kind: 'added', lineNumber, marker: '+', text: newLine, parts: added });
  }
  if (hasFileContext) context.after.forEach((text, i) => rows.push({ kind: 'context', lineNumber: lineIndex + i + 2, marker: ' ', text }));
  const canExpand = hasFileContext && (context.firstLineIndex > 0 || lineIndex + context.after.length + 1 < context.lineCount);
  return { rows, hasFileContext, noProposal, emptied: newLine === '', canExpand };
}

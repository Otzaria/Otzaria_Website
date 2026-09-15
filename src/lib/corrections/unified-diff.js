/**
 * diff של שינוי שורה בקובץ מקור, בפורמט unified (כמו git) ובמבנה hunk מפורק.
 * ההקשר נלקח מאותו blob שממנו נגזר ה-change_digest; אינו חלק מה-digest (CONTRACT §3.1).
 */

export const DEFAULT_DIFF_CONTEXT_LINES = 3;
export const MAX_DIFF_CONTEXT_LINES = 50;

const EOL_NAMES = { '\r\n': 'crlf', '\n': 'lf', '\r': 'cr', '': 'none' };
const NO_EOL = '\\ No newline at end of file';

export function clampContextLines(value, dflt = DEFAULT_DIFF_CONTEXT_LINES) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(MAX_DIFF_CONTEXT_LINES, Math.max(0, n));
}

/**
 * שורות ההקשר סביב lineIndex, מתוך קובץ מפורק ב-splitSourceLines (בלי BOM ובלי סיומות שורה).
 * @returns {{contextLines:number, firstLineIndex:number, before:string[], after:string[], lineCount:number, finalNewline:boolean, lineEnding:string} | null}
 */
export function extractLineContext(parsed, lineIndex, contextLines = DEFAULT_DIFF_CONTEXT_LINES) {
  const lines = parsed?.lines;
  if (!Array.isArray(lines) || !Number.isSafeInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) return null;
  const n = clampContextLines(contextLines);
  const from = Math.max(0, lineIndex - n);
  const to = Math.min(lines.length, lineIndex + 1 + n);
  return {
    contextLines: n,
    firstLineIndex: from,
    before: lines.slice(from, lineIndex).map((l) => l.text),
    after: lines.slice(lineIndex + 1, to).map((l) => l.text),
    lineCount: lines.length,
    finalNewline: lines[lines.length - 1].eol !== '',
    lineEnding: EOL_NAMES[lines[lineIndex].eol] ?? 'none',
  };
}

/** השורה שתיכתב בפועל: BOM שהגיע מה-DB בשורה הראשונה אינו חלק מתוכן השורה בקובץ. */
export function committedNewLine(source, newLine) {
  if (typeof newLine !== 'string') return null;
  return source?.bomAdjusted && newLine.startsWith('﻿') ? newLine.slice(1) : newLine;
}

const range = (start, count) => (count === 1 ? `${start}` : `${start},${count}`);

/**
 * @returns {{format:'unified', context_lines:number, unified:string, hunk:object} | null}
 * null כשאין הצעה, אין הקשר, או שההקשר אינו של אותה שורה.
 */
export function buildLineHunk({ path, lineIndex, originalLine, newLine, context }) {
  if (typeof newLine !== 'string' || typeof originalLine !== 'string' || typeof path !== 'string' || !context) return null;
  if (!Number.isSafeInteger(lineIndex) || context.firstLineIndex + context.before.length !== lineIndex) return null;
  const startLine = context.firstLineIndex + 1;
  const count = context.before.length + 1 + context.after.length;
  const lastIndex = context.lineCount - 1;
  const markChanged = !context.finalNewline && lineIndex === lastIndex;
  const markAfter = !context.finalNewline && !markChanged && lineIndex + context.after.length === lastIndex && context.after.length > 0;

  const out = [`--- a/${path}`, `+++ b/${path}`, `@@ -${range(startLine, count)} +${range(startLine, count)} @@`];
  for (const l of context.before) out.push(` ${l}`);
  out.push(`-${originalLine}`);
  if (markChanged) out.push(NO_EOL);
  out.push(`+${newLine}`);
  if (markChanged) out.push(NO_EOL);
  for (const l of context.after) out.push(` ${l}`);
  if (markAfter) out.push(NO_EOL);

  return {
    format: 'unified',
    context_lines: context.contextLines,
    unified: `${out.join('\n')}\n`,
    hunk: {
      start_line: startLine,
      line_number: lineIndex + 1,
      before: [...context.before],
      removed: [originalLine],
      added: [newLine],
      after: [...context.after],
      line_ending: context.lineEnding,
    },
  };
}

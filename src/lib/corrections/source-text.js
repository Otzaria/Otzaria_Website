/**
 * פירוק ושחזור קובץ מקור בלי לאבד בייט: BOM, סיומת השורה של כל שורה (LF/CRLF/CR)
 * ושורה אחרונה בלי סיומת נשמרים כמו שהם. אין החלפה גלובלית — רק שורה לפי אינדקס.
 */

const BOM = '\ufeff';

/** @returns {{bom:boolean, lines:Array<{text:string, eol:string}>}} */
export function splitSourceLines(content) {
  let s = String(content ?? '');
  const bom = s.startsWith(BOM);
  if (bom) s = s.slice(1);
  const lines = [];
  // אותה חלוקה כמו String.lines() של Kotlin בבניית ה-DB: CRLF, LF או CR בודד.
  const re = /\r\n|\n|\r/g;
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    lines.push({ text: s.slice(last, m.index), eol: m[0] });
    last = m.index + m[0].length;
  }
  if (last < s.length || lines.length === 0) lines.push({ text: s.slice(last), eol: '' });
  return { bom, lines };
}

export function joinSourceLines({ bom, lines }) {
  return (bom ? BOM : '') + lines.map((l) => l.text + l.eol).join('');
}

/**
 * מחליף שורה אחת בדיוק. בודק שהשורה הנוכחית היא expectedOriginal.
 * @returns {{status:'applied', content:string} | {status:'already_applied'} | {status:'mismatch', currentLine:(string|null)}}
 */
export function applyLineChange(content, lineIndex, expectedOriginal, newLine) {
  if (/[\r\n]/.test(newLine)) return { status: 'mismatch', currentLine: null, reason: 'structural_change' };
  const parsed = splitSourceLines(content);
  const line = parsed.lines[lineIndex];
  if (!line) return { status: 'mismatch', currentLine: null };
  if (line.text === expectedOriginal) {
    const lines = parsed.lines.slice();
    lines[lineIndex] = { text: newLine, eol: line.eol };
    return { status: 'applied', content: joinSourceLines({ bom: parsed.bom, lines }) };
  }
  if (line.text === newLine) return { status: 'already_applied' };
  return { status: 'mismatch', currentLine: line.text };
}

/** true אם המחרוזת נוצרה מבתים שאינם UTF-8 תקין (פענוח עם החלפה). */
export function isLossyUtf8(buffer) {
  const text = buffer.toString('utf8');
  return !Buffer.from(text, 'utf8').equals(buffer);
}

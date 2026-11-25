/**
 * PR של תיקון שנסגר בלי מיזוג אינו בהכרח תיקון שנדחה: מנהל הספרייה בודק כל PR, מחיל אותו בקומיט
 * מקומי מרוכז שנדחף ל-main מאוחר יותר, וסוגר את ה-PR בלי מיזוג. לכן מה שקובע הוא תוכן main.
 * כאן הלוגיקה הטהורה: השוואת השורה בקובץ לחבילת השינוי, והמעבר שנגזר ממנה ומזמן ההמתנה.
 * הקריאה מ-GitHub והעדכון ב-DB — ב-closed-pr.js.
 */
import { matchLine } from './resolver.js';
import { splitSourceLines } from './source-text.js';

export const ABSORPTION = Object.freeze({ ABSORBED: 'absorbed', PENDING: 'pending', CHANGED: 'changed' });

/** סיבות ההעברה לידני של דיווח שה-PR שלו נסגר בלי מיזוג (תוויות ב-states.js). */
export const PR_CLOSED_HANDOFF = Object.freeze({
  NOT_ABSORBED: 'pr_closed_not_absorbed',
  CHANGED: 'source_changed_after_pr_close',
});

export const CLOSED_PR_ACTION = Object.freeze({
  CLOSE_ABSORBED: 'close_absorbed',
  AWAIT: 'await',
  HANDOFF_NOT_ABSORBED: 'handoff_not_absorbed',
  HANDOFF_CHANGED: 'handoff_changed',
});

// תווים מכל צד של העריכה שמזהים את מקומה בשורה (בערך מילה-שתיים).
export const EDIT_CONTEXT_CHARS = 12;

const isLineIndex = (n) => Number.isSafeInteger(n) && n >= 0;
// "נמצא פעם אחת בדיוק" בלשון matchLine: exact בשורה עצמה או relocated למקום יחיד אחר.
const uniqueAt = (m) => (m.status === 'exact' || m.status === 'relocated') && isLineIndex(m.lineIndex) ? m.lineIndex : null;
const noBom = (s) => (s.startsWith('﻿') ? s.slice(1) : s);

/**
 * העריכה בין שתי גרסאות של שורה: מה הוסר ומה נוסף בין הקידומת לסיומת המשותפות, ועד context תווים
 * של הקשר מכל צד. כשההקשר הוא כל הקידומת (או הסיומת), העריכה מעוגנת לתחילת (או סוף) השורה.
 */
export function lineEdit(before, after, context = EDIT_CONTEXT_CHARS) {
  const max = Math.min(before.length, after.length);
  let p = 0;
  while (p < max && before[p] === after[p]) p += 1;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s += 1;
  return {
    removed: before.slice(p, before.length - s),
    inserted: after.slice(p, after.length - s),
    left: before.slice(Math.max(0, p - context), p),
    right: before.slice(before.length - s, before.length - s + context),
    atStart: p <= context,
    atEnd: s <= context,
  };
}

function occurrences(line, pattern, { atStart, atEnd }) {
  if (atStart && atEnd) return line === pattern ? 1 : 0;
  if (atStart) return line.startsWith(pattern) ? 1 : 0;
  if (atEnd) return line.endsWith(pattern) ? 1 : 0;
  if (!pattern) return 0;
  let n = 0;
  for (let i = line.indexOf(pattern); i !== -1; i = line.indexOf(pattern, i + 1)) n += 1;
  return n;
}

/**
 * מצב העריכה בשורה, גם כשתיקונים אחרים כבר הוחלו באותה שורה (שורות ארוכות: כמה דיווחים על שורה
 * אחת, ומנהל הספרייה מחיל את כולם יחד). 'applied' — הנוסח החדש בהקשרו נמצא והמקורי לא; 'original'
 * — להפך; 'both' — שניהם (אין דרך לדעת); null — אף אחד (ההקשר עצמו השתנה).
 */
export function editState(line, edit) {
  const applied = occurrences(line, edit.left + edit.inserted + edit.right, edit);
  const original = occurrences(line, edit.left + edit.removed + edit.right, edit);
  if (applied && original) return 'both';
  return applied ? 'applied' : original ? 'original' : null;
}

/** השורות בטווח (בלי היעד עצמו) שבהן העריכה הוחלה / עדיין במקור. */
function editsNear(texts, edit, lineIndex, range) {
  const out = { applied: [], original: [] };
  for (let i = Math.max(0, lineIndex - range); i <= Math.min(texts.length - 1, lineIndex + range); i++) {
    if (i === lineIndex) continue;
    const st = editState(texts[i], edit);
    if (st === 'applied' || st === 'both') out.applied.push(i);
    if (st === 'original' || st === 'both') out.original.push(i);
  }
  return out;
}

/**
 * האם השינוי (original_line → new_line בשורה line_index) נקלט בתוכן הקובץ.
 * קודם השורה כולה, בהתאמה של matchLine (כמו ה-resolver, כולל BOM ו-CRLF); ואם השורה ביעד אינה
 * זהה לאף אחת מהן — העריכה עצמה בהקשרה (lineEdit), כי באותה שורה ייתכנו תיקונים נוספים שהוחלו יחד.
 * - absorbed: התיקון נמצא בשורת היעד; או (שורות זזו) פעם אחת בלבד עד relocationLines שורות ממנה,
 *   כשהמקור אינו נמצא.
 * - pending: המקור עדיין בשורת היעד; או השורה המקורית כולה פעם אחת בקובץ / המקור בהקשרו פעם אחת
 *   בטווח, כשהתיקון אינו נמצא.
 * - changed: כל השאר — שונה אחרת, עמימות, קובץ חסר או שאינו UTF-8 תקין. ספק = ידני, ולעולם לא
 *   "נקלט": סגירה כפורסם נעשית בלי עין אנושית.
 * @param {{content:string, lossy?:boolean}|null} file  הקובץ ב-main (null = אינו קיים)
 * @param {{lineIndex:number, originalLine:string, newLine:string}} change
 * @param {{relocationLines?:number, editContext?:number}} [opts]
 * @returns {{outcome:'absorbed'|'pending'|'changed', detail:string, lineIndex:(number|null), relocated:boolean}}
 */
export function evaluateAbsorption(file, change, { relocationLines = 0, editContext = EDIT_CONTEXT_CHARS } = {}) {
  const verdict = (outcome, detail, lineIndex = null) => ({ outcome, detail, lineIndex, relocated: lineIndex !== null && lineIndex !== change.lineIndex });
  if (!file) return verdict(ABSORPTION.CHANGED, 'target_missing');
  if (file.lossy) return verdict(ABSORPTION.CHANGED, 'non_utf8_source');
  if (!isLineIndex(change.lineIndex) || typeof change.originalLine !== 'string' || typeof change.newLine !== 'string') {
    return verdict(ABSORPTION.CHANGED, 'no_target_line');
  }
  const { lineIndex, originalLine, newLine } = change;
  const orig = matchLine(file.content, { originalLine, lineIndex, newLine });
  if (orig.status === 'already_applied') {
    // שורה ריקה ביעד (מחיקת תוכן השורה) אינה ראיה כשהמקורית עדיין בקובץ — שורות זזו.
    const blankButOriginalLeft = !newLine.trim() && matchLine(file.content, { originalLine, lineIndex: null, newLine: null }).status !== 'selection_not_found';
    return blankButOriginalLeft ? verdict(ABSORPTION.CHANGED, 'ambiguous') : verdict(ABSORPTION.ABSORBED, 'applied', lineIndex);
  }
  if (orig.status === 'exact' && orig.lineIndex === lineIndex) return verdict(ABSORPTION.PENDING, 'original_in_place', lineIndex);

  const texts = splitSourceLines(file.content).lines.map((l) => l.text);
  const edit = lineEdit(noBom(originalLine), noBom(newLine), editContext);
  const here = lineIndex < texts.length ? editState(texts[lineIndex], edit) : null;
  if (here === 'applied') return verdict(ABSORPTION.ABSORBED, 'edit_applied', lineIndex);
  if (here === 'original') return verdict(ABSORPTION.PENDING, 'edit_pending', lineIndex);
  if (here === 'both' || orig.status === 'ambiguous') return verdict(ABSORPTION.CHANGED, 'ambiguous');

  // שורות זזו (נוספו/נמחקו לפני היעד): השורה כולה, או העריכה בהקשרה, במקום אחר.
  const fresh = matchLine(file.content, { originalLine: newLine, lineIndex, newLine: null });
  const freshAt = uniqueAt(fresh);
  const freshNear = freshAt !== null && Math.abs(freshAt - lineIndex) <= relocationLines;
  const near = editsNear(texts, edit, lineIndex, relocationLines);
  const origAt = uniqueAt(orig);
  const appliedAt = freshNear ? freshAt : near.applied.length === 1 && !near.original.length ? near.applied[0] : null;
  const originalAt = origAt ?? (near.original.length === 1 && !near.applied.length ? near.original[0] : null);
  if (appliedAt !== null && originalAt === null) return verdict(ABSORPTION.ABSORBED, freshNear ? 'applied_relocated' : 'edit_applied_relocated', appliedAt);
  if (originalAt !== null && appliedAt === null) return verdict(ABSORPTION.PENDING, origAt !== null ? 'original_relocated' : 'edit_pending_relocated', originalAt);
  const ambiguous = (appliedAt !== null && originalAt !== null) || fresh.status === 'ambiguous' || near.applied.length > 1 || near.original.length > 1;
  return verdict(ABSORPTION.CHANGED, ambiguous ? 'ambiguous' : freshAt !== null ? 'applied_too_far' : 'line_changed');
}

/** סיבת ההעברה לידני של מעבר, או null למעבר שאינו העברה לידני. */
export function handoffReasonOf(action) {
  if (action === CLOSED_PR_ACTION.HANDOFF_CHANGED) return PR_CLOSED_HANDOFF.CHANGED;
  if (action === CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED) return PR_CLOSED_HANDOFF.NOT_ABSORBED;
  return null;
}

/**
 * המעבר לדיווח שה-PR שלו נסגר בלי מיזוג: נקלט → נסגר כפורסם; עדיין המקור → ממתינים עד graceSeconds
 * מהרגע שהסגירה זוהתה, ואז לידני; כל השאר → ידני מיד.
 * @param {{outcome:string}} verdict  תוצאת evaluateAbsorption
 * @param {{closedAt:Date, now:Date, graceSeconds:number}} timing
 */
export function closedPrAction(verdict, { closedAt, now, graceSeconds }) {
  if (verdict.outcome === ABSORPTION.ABSORBED) return CLOSED_PR_ACTION.CLOSE_ABSORBED;
  if (verdict.outcome !== ABSORPTION.PENDING) return CLOSED_PR_ACTION.HANDOFF_CHANGED;
  const waitedMs = now.getTime() - new Date(closedAt).getTime();
  return waitedMs >= graceSeconds * 1000 ? CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED : CLOSED_PR_ACTION.AWAIT;
}

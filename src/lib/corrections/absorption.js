/**
 * PR של תיקון שנסגר בלי מיזוג אינו בהכרח תיקון שנדחה: מנהל הספרייה בודק כל PR, מחיל אותו בקומיט
 * מקומי מרוכז שנדחף ל-main מאוחר יותר, וסוגר את ה-PR בלי מיזוג. לכן מה שקובע הוא תוכן main.
 * כאן הלוגיקה הטהורה: איתור שורת היעד ב-main (עיגון לשכנים מהבסיס), השוואתה לחבילת השינוי, והמעבר
 * שנגזר מהתוצאה ומזמן ההמתנה. הקריאה מ-GitHub והעדכון ב-DB — ב-closed-pr.js.
 */
import { splitSourceLines } from './source-text.js';

export const ABSORPTION = Object.freeze({ ABSORBED: 'absorbed', PENDING: 'pending', CHANGED: 'changed' });

/** סיבות ההעברה לידני של דיווח שה-PR שלו נסגר בלי מיזוג (תוויות ב-states.js). */
export const PR_CLOSED_HANDOFF = Object.freeze({
  NOT_ABSORBED: 'pr_closed_not_absorbed',
  CHANGED: 'source_changed_after_pr_close',
  REJECTED: 'pr_rejected_by_maintainer',
  UNVERIFIED: 'pr_closed_unverified',
});

export const CLOSED_PR_ACTION = Object.freeze({
  CLOSE_ABSORBED: 'close_absorbed',
  AWAIT: 'await',
  HANDOFF_NOT_ABSORBED: 'handoff_not_absorbed',
  HANDOFF_CHANGED: 'handoff_changed',
  HANDOFF_REJECTED: 'handoff_rejected',
  HANDOFF_UNVERIFIED: 'handoff_unverified',
});

// תווים מכל צד של העריכה שמזהים את מקומה בשורה (בערך מילה-שתיים).
export const EDIT_CONTEXT_CHARS = 12;
// עיגון: עד כמה שורות לא-ריקות מכל צד, וכמה שורות סורקים כדי למצוא אותן (דילוג על שורות ריקות).
export const ANCHOR_NEIGHBORS = 2;
const ANCHOR_SCAN = 12;
// שורה ארוכה ששכן שלה נערך (למשל תיקון אחר שהוחל יחד) עדיין "אותה שורה": רוב המילים משותפות.
const LONG_LINE_CHARS = 40;
const SAME_LINE_WORDS = 0.8;

const BOM = '﻿';
const isLineIndex = (n) => Number.isSafeInteger(n) && n >= 0;
const noBom = (s) => (s.startsWith(BOM) ? s.slice(1) : s);
const norm = (s) => noBom(String(s ?? '')).normalize('NFC').replace(/\s+/g, ' ').trim();

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

// פירוק הקובץ לשורות — פעם אחת לכל אובייקט קובץ (כמה דיווחים על אותו קובץ באותה אצווה).
const parsedFiles = new WeakMap();
export function fileLines(file) {
  if (Array.isArray(file.texts)) return file.texts;
  let texts = parsedFiles.get(file);
  if (!texts) {
    texts = splitSourceLines(file.content).lines.map((l) => l.text);
    parsedFiles.set(file, texts);
  }
  return texts;
}

/** "אותה שורה": זהה אחרי נרמול רווחים, או — בשורות ארוכות — רוב המילים משותפות. */
export function sameLine(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  if (x.length < LONG_LINE_CHARS || y.length < LONG_LINE_CHARS) return false;
  const A = new Set(x.split(' '));
  const B = new Set(y.split(' '));
  let common = 0;
  for (const w of A) if (B.has(w)) common += 1;
  return common / (A.size + B.size - common) >= SAME_LINE_WORDS;
}

/** עד n שורות לא-ריקות הקרובות ביותר ל-i בכיוון dir (הקרובה ראשונה). */
function nearestNonEmpty(texts, i, dir, n) {
  const out = [];
  for (let j = i + dir, steps = 0; j >= 0 && j < texts.length && out.length < n && steps < ANCHOR_SCAN; j += dir, steps += 1) {
    if (norm(texts[j])) out.push(texts[j]);
  }
  return out;
}

/** השכנים של שורת היעד בבסיס: עד ANCHOR_NEIGHBORS שורות לא-ריקות מכל צד (הקרובה ראשונה). */
export function baseNeighbors(base) {
  if (!base || !Array.isArray(base.before) || !Array.isArray(base.after)) return null;
  const pick = (lines) => lines.filter((l) => norm(l)).slice(0, ANCHOR_NEIGHBORS);
  return { before: pick([...base.before].reverse()), after: pick(base.after) };
}

/**
 * מקום שורת היעד ב-main לפי השכנים שלה בבסיס (הקובץ בזמן האישור): המקום היחיד בטווח שבו השכנים
 * תואמים — כולם, או כולם חוץ מאחד כשידועים שלושה ומעלה (שורה שנוספה בין השכנים, או שכן שנערך).
 * בלי בסיס, בלי שני שכנים לפחות, בלי התאמה או עם כמה מקומות תואמים — אין עיגון.
 * @returns {{at:number} | {none:string}}
 */
export function anchorTarget(texts, lineIndex, base, range) {
  const nb = baseNeighbors(base);
  if (!nb) return { none: 'no_base' };
  const known = nb.before.length + nb.after.length;
  if (known < 2) return { none: 'weak_base' };
  const need = known >= 3 ? known - 1 : known;
  let best = -1;
  let at = [];
  for (let p = Math.max(0, lineIndex - range); p <= Math.min(texts.length - 1, lineIndex + range); p++) {
    const up = nearestNonEmpty(texts, p, -1, nb.before.length);
    const down = nearestNonEmpty(texts, p, 1, nb.after.length);
    let score = 0;
    nb.before.forEach((line, k) => { if (up[k] !== undefined && sameLine(up[k], line)) score += 1; });
    nb.after.forEach((line, k) => { if (down[k] !== undefined && sameLine(down[k], line)) score += 1; });
    if (score > best) [best, at] = [score, [p]];
    else if (score === best) at.push(p);
  }
  if (best < need) return { none: 'not_found' };
  if (at.length !== 1) return { none: 'ambiguous' };
  // שורה שנראית כמו אחד השכנים עצמם אינה שורת היעד (למשל שכן שזז אל מקום היעד).
  if ([...nb.before, ...nb.after].some((line) => sameLine(texts[at[0]], line))) return { none: 'ambiguous' };
  return { at: at[0] };
}

/**
 * האם השינוי (original_line → new_line בשורה line_index) נקלט ב-main.
 * שורת היעד מאותרת קודם לפי השכנים שלה בבסיס (change.base: השורות שלפניה ואחריה בזמן האישור), ורק
 * בה בודקים: השורה כולה זהה להצעה או למקור, או — כשהוחלו באותה שורה גם תיקונים אחרים — העריכה עצמה
 * בהקשרה. מופע של הנוסח המתוקן בשורה אחרת אינו ראיה (ייתכן שהיה שם כבר בבסיס).
 * בלי עיגון (אין בסיס, או שהשכנים לא נמצאו) נבדקת רק השורה במקומה המקורי, ו"נקלט" רק כשהמקור
 * (השורה או העריכה) אינו נמצא עד relocationLines שורות ממנה. הזזה בלי עיגון אינה ראיה לקליטה.
 * - absorbed: התיקון בשורת היעד והמקור לא. - pending: המקור עדיין שם.
 * - changed: כל השאר — נוסח אחר, עמימות, קובץ חסר או שאינו UTF-8 תקין. ספק = ידני, לעולם לא "נקלט".
 * @param {{content?:string, texts?:string[], lossy?:boolean}|null} file  הקובץ ב-main (null = אינו קיים)
 * @param {{lineIndex:number, originalLine:string, newLine:string, base?:{before:string[], after:string[]}|null, baseLines?:string[]|null}} change
 *   base — שכני שורת היעד בבסיס (לעיגון); baseLines — הקובץ המלא בבסיס, כשידוע (לבדיקה בלי עיגון)
 * @param {{relocationLines?:number, editContext?:number, requireBase?:boolean}} [opts]
 *   requireBase — כל "נקלט" (גם מעוגן) דורש את הבסיס המלא (baseLines); בלעדיו התוצאה changed/base_required (ייצור: תמיד true)
 * @returns {{outcome:'absorbed'|'pending'|'changed', detail:string, lineIndex:(number|null), relocated:boolean, anchored:boolean}}
 */
export function evaluateAbsorption(file, change, { relocationLines = 0, editContext = EDIT_CONTEXT_CHARS, requireBase = false } = {}) {
  let anchored = false;
  const verdict = (outcome, detail, lineIndex = null) => ({ outcome, detail, lineIndex, relocated: lineIndex !== null && lineIndex !== change.lineIndex, anchored });
  if (!file) return verdict(ABSORPTION.CHANGED, 'target_missing');
  if (file.lossy) return verdict(ABSORPTION.CHANGED, 'non_utf8_source');
  if (!isLineIndex(change.lineIndex) || typeof change.originalLine !== 'string' || typeof change.newLine !== 'string') {
    return verdict(ABSORPTION.CHANGED, 'no_target_line');
  }
  const texts = fileLines(file);
  const li = change.lineIndex;
  const orig = noBom(change.originalLine);
  const fresh = noBom(change.newLine);
  const edit = lineEdit(orig, fresh, editContext);
  const stateOf = (i) => {
    if (!(i >= 0 && i < texts.length)) return null;
    if (texts[i] === fresh) return 'applied';
    if (texts[i] === orig) return 'original';
    return editState(texts[i], edit);
  };
  const exact = (i, text) => texts[i] === text;
  // מספר מופעי התיקון (לא מספר שורות): פיצול פסקה ליד העריכה מגדיל את מספר השורות הנושאות אותו בלי תיקון.
  const appliedPattern = edit.left + edit.inserted + edit.right;
  const fixIn = (line) => {
    const n = occurrences(line, appliedPattern, edit);
    return line === fresh ? Math.max(n, 1) : n;
  };
  const countFix = (lines, lo, hi) => {
    let n = 0;
    for (let i = Math.max(0, lo); i <= Math.min(lines.length - 1, hi); i++) n += fixIn(lines[i]);
    return n;
  };

  const anchor = anchorTarget(texts, li, change.base, relocationLines);
  if (anchor.at !== undefined) {
    anchored = true;
    const at = anchor.at;
    const moved = at === li ? '' : '_relocated';
    const st = stateOf(at);
    // הבסיס המלא ידוע: גם בנתיב המעוגן הראיה חייבת להיות חדשה. עותק כפול שכבר נשא את התיקון בבסיס
    // (והעיגון ננעל עליו) אינו ראיה — בקובץ כולו מספר מופעי התיקון חייב לעלות לעומת הבסיס.
    if (st === 'applied' && Array.isArray(change.baseLines) && countFix(texts, 0, texts.length - 1) <= countFix(change.baseLines, 0, change.baseLines.length - 1)) {
      return verdict(ABSORPTION.CHANGED, 'fix_not_new', at);
    }
    // בלי הבסיס המלא גם העיגון אינו ראיה מספקת: הוא עלול להינעל על עותק כפול שכבר נשא את התיקון בבסיס, ורק
    // השוואת הבסיס תופסת זאת. טעות כאן מאבדת תיקון בשקט, לכן ממתינים (ובודקים שוב עם הבסיס).
    if (st === 'applied' && requireBase && !Array.isArray(change.baseLines)) return verdict(ABSORPTION.CHANGED, 'base_required', at);
    if (st === 'applied') return verdict(ABSORPTION.ABSORBED, `${exact(at, fresh) ? 'applied' : 'edit_applied'}${moved}`, at);
    if (st === 'original') return verdict(ABSORPTION.PENDING, exact(at, orig) ? `original${moved || '_in_place'}` : `edit_pending${moved}`, at);
    return verdict(ABSORPTION.CHANGED, st === 'both' ? 'ambiguous' : 'line_changed');
  }

  // בלי עיגון (למשל מנהל הספרייה פיצל או איחד פסקאות, והשכנים השתנו): שורת היעד במקומה, ורק כשהמקור
  // אינו בסביבה. כשהבסיס המלא ידוע (change.baseLines) — "ראיה" רק כשנוסף בדיוק מופע אחד של התיקון
  // לעומת הבסיס: מופע שהיה שם כבר בבסיס אינו ראיה, גם כשהשורה שלו זזה אל היעד או נערכה.
  const from = Math.max(0, li - relocationLines);
  const to = Math.min(texts.length - 1, li + relocationLines);
  const near = { original: [], applied: [] };
  // שורה ריקה (מחיקת תוכן השורה) נמצאת בכל מקום — אינה ראיה מחוץ לשורת היעד.
  const freshIsEvidence = Boolean(fresh.trim());
  for (let i = from; i <= to; i++) {
    if (i === li) continue;
    const st = stateOf(i);
    if (st === 'original' || st === 'both') near.original.push(i);
    if ((st === 'applied' || st === 'both') && freshIsEvidence) near.applied.push(i);
  }
  const baseLines = Array.isArray(change.baseLines) ? change.baseLines : null;
  const carriesFix = (line) => line === fresh || ['applied', 'both'].includes(editState(line, edit));
  // חלון רחב יותר בבסיס: שורות שזזו עדיין נספרות כ"היו שם קודם" (כיוון זהיר).
  const addedFix = () => (baseLines ? countFix(texts, from, to) - countFix(baseLines, li - 2 * relocationLines, li + 2 * relocationLines) : null);
  const here = stateOf(li);
  if (here === 'applied') {
    if (near.original.length) return verdict(ABSORPTION.CHANGED, 'original_nearby');
    // שורה ריקה ביעד (מחיקת תוכן השורה) אינה ראיה כשהמקורית עדיין בקובץ — שורות זזו.
    if (!fresh.trim() && texts.includes(orig)) return verdict(ABSORPTION.CHANGED, 'ambiguous');
    const added = addedFix();
    // בלי עיגון ובלי הבסיס המלא אין דרך לדעת שהתיקון חדש: ממתינים (ובודקים שוב עם הבסיס), לעולם לא "נקלט".
    if (added === null && requireBase) return verdict(ABSORPTION.CHANGED, 'base_required');
    if (added !== null && added !== 1) return verdict(ABSORPTION.CHANGED, 'fix_not_new');
    return verdict(ABSORPTION.ABSORBED, exact(li, fresh) ? 'applied' : 'edit_applied', li);
  }
  if (here === 'original') return verdict(ABSORPTION.PENDING, exact(li, orig) ? 'original_in_place' : 'edit_pending', li);
  if (here === 'both') return verdict(ABSORPTION.CHANGED, 'ambiguous');
  // שורת היעד אינה אף אחת מהן: "ממתין" כשהמקור זז בלי שינוי; "נקלט" רק עם הבסיס המלא, כשנוסף מופע אחד.
  const origAt = texts.indexOf(orig);
  const origUnique = origAt !== -1 && texts.indexOf(orig, origAt + 1) === -1;
  if (!near.applied.length && origUnique) return verdict(ABSORPTION.PENDING, 'original_relocated', origAt);
  if (!near.applied.length && near.original.length === 1) return verdict(ABSORPTION.PENDING, 'edit_pending_relocated', near.original[0]);
  if (near.applied.length && !near.original.length && addedFix() === 1) {
    const fresh1 = near.applied.filter((i) => !baseLines.some((b, j) => Math.abs(j - li) <= 2 * relocationLines && carriesFix(b) && sameLine(b, texts[i])));
    const at = fresh1.length === 1 ? fresh1[0] : near.applied.length === 1 ? near.applied[0] : null;
    return verdict(ABSORPTION.ABSORBED, at !== null && exact(at, fresh) ? 'applied_relocated' : 'edit_applied_relocated', at);
  }
  return verdict(ABSORPTION.CHANGED, near.applied.length ? 'relocated_unanchored' : near.original.length ? 'ambiguous' : 'line_changed');
}

/** סיבת ההעברה לידני של מעבר, או null למעבר שאינו העברה לידני. */
export function handoffReasonOf(action) {
  return {
    [CLOSED_PR_ACTION.HANDOFF_CHANGED]: PR_CLOSED_HANDOFF.CHANGED,
    [CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED]: PR_CLOSED_HANDOFF.NOT_ABSORBED,
    [CLOSED_PR_ACTION.HANDOFF_REJECTED]: PR_CLOSED_HANDOFF.REJECTED,
    [CLOSED_PR_ACTION.HANDOFF_UNVERIFIED]: PR_CLOSED_HANDOFF.UNVERIFIED,
  }[action] ?? null;
}

/** תום ההמתנה לקליטה: מרגע שהסגירה זוהתה. */
export const absorptionDeadline = (closedAt, graceSeconds) => new Date(new Date(closedAt).getTime() + graceSeconds * 1000);

/** בתום ההמתנה, לפי התוצאה האחרונה שנבדקה (או בלי בדיקה מוצלחת כלל). */
export function expiredAction(lastOutcome) {
  if (lastOutcome === ABSORPTION.CHANGED) return CLOSED_PR_ACTION.HANDOFF_CHANGED;
  if (lastOutcome === ABSORPTION.PENDING) return CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED;
  return CLOSED_PR_ACTION.HANDOFF_UNVERIFIED;
}

/**
 * המעבר לדיווח שה-PR שלו נסגר בלי מיזוג: תווית דחייה של מנהל הספרייה → ידני מיד (תווית לעולם אינה
 * מקצרת את בדיקת התוכן בכיוון ההפוך); נקלט → נסגר כפורסם; אחרת ממתינים עד graceSeconds מזיהוי
 * הסגירה — גם כשהשורה "שונתה", כי תיקון שכן שנדחף קודם משנה את ההקשר — ובתום ההמתנה לידני.
 * @param {{outcome:string}} verdict  תוצאת evaluateAbsorption
 * @param {{closedAt:Date, now:Date, graceSeconds:number, rejected?:boolean}} timing
 */
export function closedPrAction(verdict, { closedAt, now, graceSeconds, rejected = false }) {
  if (rejected) return CLOSED_PR_ACTION.HANDOFF_REJECTED;
  if (verdict.outcome === ABSORPTION.ABSORBED) return CLOSED_PR_ACTION.CLOSE_ABSORBED;
  return now >= absorptionDeadline(closedAt, graceSeconds) ? expiredAction(verdict.outcome) : CLOSED_PR_ACTION.AWAIT;
}

/** תווית דחייה של מנהל הספרייה על ה-PR (השמות מ-config, בלי תלות ברישיות). */
export function hasRejectedLabel(labels, rejectedLabels) {
  const wanted = new Set((rejectedLabels || []).map((l) => String(l).trim().toLowerCase()));
  return (labels || []).some((l) => wanted.has(String(l).trim().toLowerCase()));
}

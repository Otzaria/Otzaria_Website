/**
 * בדיקות הכלל הטהור ל-PR שנסגר בלי מיזוג: האם התיקון נקלט ב-main, והמעבר שנגזר ממנו. הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAbsorption, closedPrAction, handoffReasonOf, expiredAction, absorptionDeadline, hasRejectedLabel, lineEdit, editState,
  anchorTarget, sameLine, ABSORPTION, CLOSED_PR_ACTION, PR_CLOSED_HANDOFF,
} from './absorption.js';
import { deriveLabels } from './labels.js';
import { HANDOFF_REASON_LABELS } from './states.js';

const L0 = '<h1>בראשית</h1>';
const OLD = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const NEW = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים';
const CHANGE = { lineIndex: 2, originalLine: OLD, newLine: NEW };
const file = (lines, eol = '\r\n') => ({ content: lines.join(eol) + eol, lossy: false });
const check = (lines, change = CHANGE, relocationLines = 50) => evaluateAbsorption(file(lines), change, { relocationLines });
const filler = (n) => Array.from({ length: n }, (_, i) => `שורה ${i}`);
/** הבסיס כפי שנשמר באישור (resolvedSource.context): עד 3 שורות לפני ואחרי שורת היעד. */
const baseOf = (lines, i) => ({ before: lines.slice(Math.max(0, i - 3), i), after: lines.slice(i + 1, i + 4) });
const pick = (v) => [v.outcome, v.detail, v.lineIndex, v.anchored];

test('נקלט: השורה ביעד היא השורה החדשה', () => {
  assert.deepEqual(check([L0, '', NEW, 'סוף']), { outcome: ABSORPTION.ABSORBED, detail: 'applied', lineIndex: 2, relocated: false, anchored: false });
  const base = baseOf([L0, '', OLD, 'סוף'], 2);
  assert.deepEqual(pick(evaluateAbsorption(file([L0, '', NEW, 'סוף']), { ...CHANGE, base }, { relocationLines: 50 })), [ABSORPTION.ABSORBED, 'applied', 2, true]);
});

test('ממתין: השורה המקורית עדיין ביעד, או זזה בלי שינוי', () => {
  assert.deepEqual(pick(check([L0, '', OLD, 'סוף'])), [ABSORPTION.PENDING, 'original_in_place', 2, false]);
  assert.deepEqual(pick(check([L0, 'א', 'ב', '', OLD, 'סוף'])), [ABSORPTION.PENDING, 'original_relocated', 4, false]);
  const base = baseOf([L0, '', OLD, 'סוף'], 2);
  assert.deepEqual(pick(evaluateAbsorption(file(['הקדמה', 'עוד', L0, '', OLD, 'סוף']), { ...CHANGE, base }, { relocationLines: 50 })), [ABSORPTION.PENDING, 'original_relocated', 4, true]);
});

test('הזזה: נקלט רק כשהשורה מעוגנת לשכנים מהבסיס; בלי עיגון — ידני', () => {
  const baseLines = [L0, 'פתיחה', OLD, 'סוף'];
  const moved = ['הקדמה', 'עוד', L0, 'פתיחה', NEW, 'סוף'];
  assert.deepEqual(pick(evaluateAbsorption(file(moved), { ...CHANGE, base: baseOf(baseLines, 2) }, { relocationLines: 50 })), [ABSORPTION.ABSORBED, 'applied_relocated', 4, true]);
  assert.deepEqual(pick(check(moved)), [ABSORPTION.CHANGED, 'relocated_unanchored', null, false], 'בלי בסיס אין "נקלט" במקום אחר');
  const far = [...filler(60), L0, 'פתיחה', NEW, 'סוף'];
  assert.equal(evaluateAbsorption(file(far), { ...CHANGE, base: baseOf(baseLines, 2) }, { relocationLines: 50 }).outcome, ABSORPTION.CHANGED, 'מחוץ לטווח');
});

test('השורה שונתה אחרת → ידני; עמימות → ידני (אף פעם לא "נקלט")', () => {
  assert.deepEqual(pick(check([L0, '', 'נוסח אחר', 'סוף'])), [ABSORPTION.CHANGED, 'line_changed', null, false]);
  assert.equal(check([OLD, '', 'נוסח אחר', OLD]).detail, 'ambiguous', 'המקורית פעמיים בקובץ');
  assert.equal(check([L0, NEW, 'נוסח אחר', OLD]).outcome, ABSORPTION.CHANGED, 'המקורית זזה וגם החדשה בסביבה');
  assert.equal(check([L0, NEW, 'נוסח אחר', NEW]).outcome, ABSORPTION.CHANGED, 'החדשה פעמיים בקובץ');
});

test('קובץ חסר, קובץ שאינו UTF-8 ושינוי בלי שורת יעד → ידני', () => {
  assert.equal(evaluateAbsorption(null, CHANGE).detail, 'target_missing');
  assert.equal(evaluateAbsorption({ content: NEW, lossy: true }, { ...CHANGE, lineIndex: 0 }).detail, 'non_utf8_source');
  assert.equal(evaluateAbsorption(file([L0, '', NEW]), { ...CHANGE, lineIndex: null }).detail, 'no_target_line');
  for (const v of [evaluateAbsorption(null, CHANGE), evaluateAbsorption(file([NEW]), { ...CHANGE, lineIndex: -1 })]) assert.equal(v.outcome, ABSORPTION.CHANGED);
});

test('BOM בשורה הראשונה מה-DB, שורות LF, ומחיקת תוכן השורה (new_line ריק)', () => {
  const bomChange = { lineIndex: 0, originalLine: `﻿${OLD}`, newLine: `﻿${NEW}` };
  assert.equal(evaluateAbsorption({ content: `﻿${NEW}\nסוף\n` }, bomChange).outcome, ABSORPTION.ABSORBED);
  assert.equal(evaluateAbsorption({ content: `﻿${OLD}\nסוף\n` }, bomChange).outcome, ABSORPTION.PENDING);
  const del = { ...CHANGE, newLine: '' };
  // מחיקת תוכן השורה כולה: אין טקסט שמזהה את הפסקה (שורה ריקה נמצאת בכל מקום) — לעולם לא "נקלט" אוטומטית (כלל 6)
  assert.deepEqual(pick(check([L0, '', '', 'סוף'], del)), [ABSORPTION.CHANGED, 'unlocated_short_empty', 2, false]);
  assert.equal(check([L0, '', OLD, ''], del).outcome, ABSORPTION.PENDING);
  assert.equal(check([L0, 'א', 'ב', '', OLD, ''], del).outcome, ABSORPTION.PENDING, 'שורות ריקות אינן ראיה; המקורית זזה');
  // שורה ריקה שזזה אל היעד אינה ראיה לקליטה כשהמקורית עדיין בסביבה
  assert.deepEqual(pick(check([L0, 'א', '', OLD, 'סוף'], del)), [ABSORPTION.CHANGED, 'original_nearby', null, false]);
});

// שורה ארוכה עם שתי טעויות, ודיווח נפרד על כל אחת — מנהל הספרייה מחיל את שניהם יחד.
const LONG = 'אמר רבי יוחנן הלכא כרבי מאיר בזו, ואמר רבא אין הלכה כמותו אלא בשבת בלבד, וכן פסק הרמבם בהלכות שבת פרק א';
const fixA = (s) => s.replace('הלכא', 'הלכה');
const fixB = (s) => s.replace('הרמבם', 'הרמב"ם');
const A = { lineIndex: 1, originalLine: LONG, newLine: fixA(LONG) };
const B = { lineIndex: 1, originalLine: LONG, newLine: fixB(LONG) };

test('lineEdit: מה הוסר ומה נוסף, עם הקשר קצר; עיגון לתחילת/סוף השורה', () => {
  const e = lineEdit(LONG, fixA(LONG), 6);
  assert.deepEqual([e.removed, e.inserted, e.left, e.right, e.atStart, e.atEnd], ['א', 'ה', 'נן הלכ', ' כרבי ', false, false]);
  const tail = lineEdit('אבג דהו זחט', 'אבג דהו זחי', 4);
  assert.deepEqual([tail.left, tail.atStart, tail.atEnd], ['ו זח', false, true]);
  assert.equal(editState('xx אבג דהו זחי', tail), 'applied', 'עיגון לסוף השורה');
  assert.equal(editState('אבג דהו זחי xx', tail), null, 'ההקשר אינו בסוף השורה');
  const whole = lineEdit('אבג', 'אבד');
  assert.deepEqual([whole.atStart, whole.atEnd], [true, true], 'שורה קצרה מההקשר — השורה כולה');
  assert.equal(editState('אבד', whole), 'applied');
});

test('כמה תיקונים באותה שורה: כל עריכה נבדקת בהקשרה, גם כשהשורה כולה אינה זהה לאף הצעה', () => {
  const both = file(['כותרת', fixB(fixA(LONG)), 'סוף']);
  assert.deepEqual(pick(evaluateAbsorption(both, A)), [ABSORPTION.ABSORBED, 'edit_applied', 1, false]);
  assert.equal(evaluateAbsorption(both, B).outcome, ABSORPTION.ABSORBED);
  assert.deepEqual(pick(evaluateAbsorption(file(['כותרת', fixB(LONG), 'סוף']), A)), [ABSORPTION.PENDING, 'edit_pending', 1, false]);
  assert.equal(evaluateAbsorption(file(['כותרת', LONG.replace('הלכא', 'הילכתא'), 'סוף']), A).detail, 'line_changed', 'תוקן אחרת → ידני');
  // השורה זזה: מעוגנת לשכנים (שורה שכנה ארוכה שנערכה גם היא עדיין "אותה שורה")
  const NEXT = 'ועוד אמר רבי יוחנן שם בגמרא דבר נוסף ארוך דיו כדי להיחשב שורה ארוכה לעיגון השכנים';
  const base = { before: ['כותרת'], after: [NEXT, 'סוף'] };
  const moved = file(['הקדמה', 'עוד', 'כותרת', fixB(fixA(LONG)), NEXT.replace('נוסף', 'אחר'), 'סוף']);
  assert.deepEqual(pick(evaluateAbsorption(moved, { ...A, base }, { relocationLines: 50 })), [ABSORPTION.ABSORBED, 'edit_applied_relocated', 3, true]);
  assert.equal(evaluateAbsorption(file(['כותרת', 'הקדמה', fixB(LONG), 'סוף']), A, { relocationLines: 50 }).detail, 'edit_pending_relocated');
});

test('אותו ביטוי פעמיים בשורה, אחד תוקן והשני לא → עמימות → ידני', () => {
  const REP = 'אמר רבי יוחנן הלכא כרבי מאיר בזו. ושוב אמר רבי יוחנן הלכא כרבי מאיר בזו. סוף';
  const change = { lineIndex: 0, originalLine: REP, newLine: REP.replace('הלכא', 'הלכה') };
  const target = file([`${change.newLine} דבר`]);
  assert.equal(editState(target.content.trimEnd(), lineEdit(REP, change.newLine)), 'both');
  assert.equal(evaluateAbsorption(target, change).detail, 'ambiguous');
});

// ---- QA (PR #312): "נקלט" שגוי כשהראיה אינה בשורת היעד עצמה ----

test("S1′: כותרת כפולה, התיקון לא הוחל ונמחקו שורות למעלה — הכותרת הבאה שזזה אל היעד אינה ראיה", () => {
  const base = ['<h2>חלק א</h2>', 'שורת קרדיט', 'שורת קרדיט 2', '<h3>יא</h3>', 'טקסט יא', '<h3>יא</h3>', 'טקסט נוסף', '<h3>יב</h3>', 'טקסט יב'];
  const change = { lineIndex: 5, originalLine: '<h3>יא</h3>', newLine: '<h3>יב</h3>' };
  const main = [base[0], ...base.slice(3)];
  for (const c of [{ ...change, base: baseOf(base, 5) }, change]) {
    const v = evaluateAbsorption(file(main), c, { relocationLines: 50 });
    assert.notEqual(v.outcome, ABSORPTION.ABSORBED, JSON.stringify(v));
  }
});

const X = 'ובגמרא שם אמר רבי יוחנן הלכה כרבי מאיר בגזירה ובנמצא, וכן כתב רש"י שם';
const T = 'ובירושלמי אמר רבי יוחנן הלכא כרבי מאיר בגזירה ובנמצא, ושם מבואר';
const TCHANGE = { lineIndex: 2, originalLine: T, newLine: T.replace('הלכא', 'הלכה') };
const TBASE = ['<h1>ספר</h1>', X, T, 'סוף'];

test('S2: לשכן כבר היה הביטוי המתוקן ונוספה שורה למעלה — השכן שזז אל היעד אינו ראיה', () => {
  const main = ['<h1>ספר</h1>', 'שורה חדשה שנוספה', X, T, 'סוף'];
  assert.deepEqual(pick(evaluateAbsorption(file(main), { ...TCHANGE, base: baseOf(TBASE, 2) }, { relocationLines: 50 })), [ABSORPTION.PENDING, 'original_relocated', 3, true]);
  assert.notEqual(evaluateAbsorption(file(main), TCHANGE, { relocationLines: 50 }).outcome, ABSORPTION.ABSORBED, 'גם בלי בסיס');
  assert.equal(evaluateAbsorption(file(TBASE), { ...TCHANGE, base: baseOf(TBASE, 2) }, { relocationLines: 50 }).outcome, ABSORPTION.PENDING, 'ביקורת: בלי הזזה');
});

test('S4′: מנהל הספרייה כתב את שורת היעד בנוסח שלישי, ולשכן כבר היה הביטוי המתוקן → לא "נקלט"', () => {
  const main = ['<h1>ספר</h1>', X, T.replace('הלכא', 'הילכתא'), 'סוף'];
  assert.deepEqual(pick(evaluateAbsorption(file(main), { ...TCHANGE, base: baseOf(TBASE, 2) }, { relocationLines: 50 })), [ABSORPTION.CHANGED, 'line_changed', null, true]);
  assert.notEqual(evaluateAbsorption(file(main), TCHANGE, { relocationLines: 50 }).outcome, ABSORPTION.ABSORBED, 'גם בלי בסיס');
});

test('כותרת כפולה (כמו d6611a9a): הכותרת הזהה במקום אחר בקובץ עדיין מונעת "נקלט" — המקור קיים בקובץ (original_elsewhere)', () => {
  const t = (s) => `<b>${s}</b> ${'טקסט התשובה הארוך דיו כדי להיחשב שורה ארוכה בעיגון '.repeat(2)}`;
  const base = [t('ואתה'), t('זה'), '<h2>יד</h2>', t('הנה'), '<h2>טז</h2>', t('שלמא'), '<h2>טז</h2>', t('והנה'), t('שלמא2')];
  const change = { lineIndex: 4, originalLine: '<h2>טז</h2>', newLine: '<h2>טו</h2>', base: baseOf(base, 4) };
  const main = base.map((l, i) => (i === 4 ? '<h2>טו</h2>' : l));
  // כלל "בשום מקום בקובץ": הכותרת המקורית עדיין בשורה 6, לכן אין ודאות שהשגיאה הוסרה — ממתין, ובתום ההמתנה ידני
  assert.deepEqual(pick(evaluateAbsorption(file(main), change, { relocationLines: 50 })), [ABSORPTION.PENDING, 'original_elsewhere', 4, true]);
  const gone = main.map((l, i) => (i === 6 ? '<h2>יז</h2>' : l));
  assert.deepEqual(pick(evaluateAbsorption(file(gone), change, { relocationLines: 50 })), [ABSORPTION.ABSORBED, 'applied', 4, true]);
  const { base: _omit, ...unanchored } = change;
  assert.equal(evaluateAbsorption(file(main), unanchored, { relocationLines: 50 }).detail, 'original_nearby', 'בלי בסיס — הבדיקה הזולה מעבירה לידני');
});

test('בלי עיגון, עם הבסיס המלא: "נקלט" רק כשנוסף בדיוק מופע אחד של התיקון לעומת הבסיס', () => {
  const P1 = 'ובירושלמי אמר';
  const P2 = 'רבי יוחנן הלכא כרבי מאיר בגזירה ובנמצא, ושם מבואר';
  assert.equal(`${P1} ${P2}`, T);
  // מנהל הספרייה פיצל את הפסקה לשתיים והחיל את התיקון בחלק השני; השכנים השתנו גם הם — אין עיגון
  const base = ['<h1>ספר</h1>', 'מבוא קצר', T, 'סוף'];
  const main = ['<h1>ספר</h1>', 'מבוא קצר ומורחב', P1, P2.replace('הלכא', 'הלכה'), 'סוף הפרק'];
  const split = { ...TCHANGE, base: null };
  assert.deepEqual(pick(evaluateAbsorption(file(main), split, { relocationLines: 50 })), [ABSORPTION.CHANGED, 'relocated_unanchored', null, false], 'בלי הבסיס המלא — ידני');
  assert.deepEqual(pick(evaluateAbsorption(file(main), { ...split, baseLines: base }, { relocationLines: 50 })), [ABSORPTION.ABSORBED, 'edit_applied_relocated', 3, false]);
  // שכן שכבר היה בו הביטוי המתוקן זז אל היעד, והיעד עצמו נכתב בנוסח אחר — הבדיקה הזולה לבדה הייתה "נקלט";
  // האיתור (כלל 6) מזהה את הפסקה המדווחת עצמה, בנוסח שלישי, ולכן גם בלי הבסיס המלא זה ספק ולא "נקלט"
  const s4 = ['<h1>ספר</h1>', X, T.replace('הלכא', 'הילכתא'), 'סוף'].slice(1);
  assert.deepEqual(pick(evaluateAbsorption(file(s4), { ...TCHANGE, base: null, lineIndex: 0 }, { relocationLines: 50 })).slice(0, 2), [ABSORPTION.CHANGED, 'unlocated_lookalike_unresolved']);
  assert.deepEqual(pick(evaluateAbsorption(file(s4), { ...TCHANGE, base: null, lineIndex: 0, baseLines: [T, X, 'סוף'] }, { relocationLines: 50 })), [ABSORPTION.CHANGED, 'fix_not_new', null, false]);
  // שני מופעים בסביבה: אחד היה בבסיס (השכן), השני חדש (התיקון) — נקלט
  const two = ['<h1>ספר</h1>', X, P1, P2.replace('הלכא', 'הלכה'), 'סוף הפרק'];
  assert.deepEqual(pick(evaluateAbsorption(file(two), { ...split, baseLines: TBASE }, { relocationLines: 50 })), [ABSORPTION.ABSORBED, 'edit_applied_relocated', 3, false]);
});

test('עיגון: שכנים זהים במקומות רבים או בסיס חלש → אין עיגון; שורה ארוכה שנערכה מעט היא "אותה שורה"', () => {
  const rep = Array.from({ length: 10 }, (_, i) => (i % 2 ? 'טקסט' : '<br>'));
  assert.deepEqual(anchorTarget(rep, 4, { before: ['<br>', 'טקסט'], after: ['טקסט', '<br>'] }, 50), { none: 'ambiguous' });
  assert.deepEqual(anchorTarget(['a', 'b'], 1, { before: [''], after: [] }, 50), { none: 'weak_base' });
  assert.deepEqual(anchorTarget(['a', 'b'], 1, null, 50), { none: 'no_base' });
  assert.equal(sameLine(LONG, fixB(fixA(LONG))), true);
  assert.equal(sameLine('<h3>יא</h3>', '<h3>יב</h3>'), false);
});

test('המעבר: נקלט → סגירה; כל השאר ממתין עד תום הזמן ואז לידני לפי התוצאה; תווית דחייה → ידני מיד', () => {
  const closedAt = new Date('2026-11-01T00:00:00Z');
  const at = (sec, extra = {}) => ({ closedAt, now: new Date(closedAt.getTime() + sec * 1000), graceSeconds: 100, ...extra });
  assert.equal(closedPrAction({ outcome: ABSORPTION.ABSORBED }, at(10_000)), CLOSED_PR_ACTION.CLOSE_ABSORBED);
  assert.equal(closedPrAction({ outcome: ABSORPTION.CHANGED }, at(0)), CLOSED_PR_ACTION.AWAIT, 'גם "השתנה" ממתין: תיקון שכן שנדחף ראשון משנה את ההקשר');
  assert.equal(closedPrAction({ outcome: ABSORPTION.CHANGED }, at(100)), CLOSED_PR_ACTION.HANDOFF_CHANGED);
  assert.equal(closedPrAction({ outcome: ABSORPTION.PENDING }, at(99)), CLOSED_PR_ACTION.AWAIT);
  assert.equal(closedPrAction({ outcome: ABSORPTION.PENDING }, at(100)), CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED);
  assert.equal(closedPrAction({ outcome: ABSORPTION.ABSORBED }, at(0, { rejected: true })), CLOSED_PR_ACTION.HANDOFF_REJECTED, 'תווית לעולם אינה עוקפת לכיוון "נקלט"');
  assert.equal(expiredAction(undefined), CLOSED_PR_ACTION.HANDOFF_UNVERIFIED);
  assert.equal(absorptionDeadline(closedAt, 100).getTime(), closedAt.getTime() + 100_000);
  const reasons = Object.values(CLOSED_PR_ACTION).map(handoffReasonOf);
  assert.deepEqual(reasons, [null, null, PR_CLOSED_HANDOFF.NOT_ABSORBED, PR_CLOSED_HANDOFF.CHANGED, PR_CLOSED_HANDOFF.REJECTED, PR_CLOSED_HANDOFF.UNVERIFIED]);
  assert.equal(hasRejectedLabel(['bug', ' Rejected '], ['לא נקלט', 'rejected']), true);
  assert.equal(hasRejectedLabel(['נקלט'], ['לא נקלט', 'rejected']), false);
});

test('תוויות: PR שנסגר וממתין לקליטה, וסיבות ההעברה לידני החדשות', () => {
  const t = (r) => deriveLabels(r).map((l) => l.text);
  assert.deepEqual(t({ publish: { status: 'pr_opened', prClosedAt: new Date() } }), ['ה-PR נסגר — ממתין לקליטה ב-main']);
  assert.deepEqual(t({ publish: { status: 'pr_opened' } }), ['נפתח PR (טרם מוזג)']);
  assert.ok(t({ publish: { status: 'failed', conflictReason: PR_CLOSED_HANDOFF.CHANGED }, manual: { handoffReason: PR_CLOSED_HANDOFF.CHANGED } }).includes('התנגשות'));
  for (const reason of Object.values(PR_CLOSED_HANDOFF)) assert.ok(HANDOFF_REASON_LABELS[reason], reason);
});

// ---- חורי "נקלט" שגוי (QA של PR 312): C1, C2, C4, C5 — מקרים מבוססי ספרייה סינתטית של 260 שורות ----
const QA_R = 50;
const QA_LI = 130;
const qaFill = (i) => Array.from({ length: 8 }, (_, k) => `w${i}x${k}q`).join(' ');
const QA_OK = 'rule: when swearing they notelin money they require denial';
const QA_ERR = QA_OK.replace('notelin', 'nouelin');
const qaBase = () => Array.from({ length: 260 }, (_, i) => qaFill(i));
const qaNeighbors = (b, li) => ({ before: b.slice(Math.max(0, li - 12), li), after: b.slice(li + 1, li + 13) });
const qaDel = (a, from, n) => a.filter((_, i) => i < from || i >= from + n);
/** מה שהייצור (evaluate ב-closed-pr.js) עושה: מעבר ראשון בלי baseLines, ואם צריך — מעבר שני איתם. requireBase תמיד. */
function qaRun(main, base, li, original, fixed, { baseReadable = true } = {}) {
  const ch = { lineIndex: li, originalLine: original, newLine: fixed, base: qaNeighbors(base, li) };
  const opts = { relocationLines: QA_R, requireBase: true };
  let v = evaluateAbsorption({ texts: main }, ch, opts);
  const needs = v.outcome === ABSORPTION.ABSORBED || ['relocated_unanchored', 'base_required'].includes(v.detail);
  if (needs && baseReadable) v = evaluateAbsorption({ texts: main }, { ...ch, baseLines: base }, opts);
  return v;
}

test('C1: פיצול פסקה ליד העריכה אינו נחשב תיקון — סופרים מופעים, לא שורות', () => {
  const b = qaBase();
  b[QA_LI] = `p1 ${QA_OK} p2 ${QA_ERR} p3 ${QA_OK} p4`;
  const fixed = b[QA_LI].replace(`p2 ${QA_ERR}`, `p2 ${QA_OK}`);
  const cut = b[QA_LI].indexOf('nouelin') + 7;
  const main = [...b];
  main.splice(QA_LI, 1, b[QA_LI].slice(0, cut), b[QA_LI].slice(cut).trim());
  const v = qaRun(main, b, QA_LI, b[QA_LI], fixed);
  assert.equal(v.outcome, ABSORPTION.CHANGED, JSON.stringify(v));
  // ביקורת: פיצול פסקה שבו התיקון אכן הוחל — מופע אחד חדש — נקלט
  const cut2 = fixed.indexOf(' p3');
  const applied = [...b];
  applied.splice(QA_LI, 1, fixed.slice(0, cut2), fixed.slice(cut2).trim());
  assert.equal(qaRun(applied, b, QA_LI, b[QA_LI], fixed).outcome, ABSORPTION.ABSORBED);
});

test('C2: עותק כפול שכבר נשא את התיקון בבסיס אינו ראיה גם כשהעיגון ננעל עליו', () => {
  const b = qaBase();
  const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((x, i) => `${x} ${qaFill(1001 + i)}`);
  const T = `${qaFill(130)} ${QA_ERR} tail`;
  const F = T.replace(QA_ERR, QA_OK);
  b.splice(QA_LI - 2, 5, A, B, T, C, D);
  b.splice(QA_LI + 78, 5, A, B, F, C, D);
  const main = qaDel(b, 20, 60);
  const v = qaRun(main, b, QA_LI, T, F);
  assert.equal(v.outcome, ABSORPTION.CHANGED, JSON.stringify(v));
  assert.equal(v.detail, 'fix_not_new');
  assert.equal(v.anchored, true);
  // ביקורת: אותו מבנה כשמנהל הספרייה אכן תיקן את T (עותק התיקון הקיים נשאר) — נקלט
  const fixedMain = main.map((l) => (l === T ? F : l));
  assert.equal(qaRun(fixedMain, b, QA_LI, T, F).outcome, ABSORPTION.ABSORBED);
});

test('C4: בלי הבסיס המלא "נקלט" לא מעוגן הופך ל-changed (base_required); עם הבסיס — fix_not_new', () => {
  const b = qaBase();
  b[QA_LI] = `${qaFill(130)} ${QA_ERR} tail`;
  b[QA_LI + 1] = `${qaFill(131)} ${QA_OK} more`;
  const fixed = b[QA_LI].replace(QA_ERR, QA_OK);
  const m = [...b];
  m[QA_LI] = b[QA_LI].replace('nouelin', 'nokelin');
  const main = qaDel(m, QA_LI - 1, 1);
  const noBase = qaRun(main, b, QA_LI, b[QA_LI], fixed, { baseReadable: false });
  assert.deepEqual([noBase.outcome, noBase.detail], [ABSORPTION.CHANGED, 'base_required']);
  assert.deepEqual(pick(qaRun(main, b, QA_LI, b[QA_LI], fixed)).slice(0, 2), [ABSORPTION.CHANGED, 'fix_not_new']);
  // גם בלי requireBase (פונקציה טהורה): האיתור (כלל 6) מוצא את הפסקה המדווחת בנוסח שלישי — ספק, לא "נקלט"
  const ch = { lineIndex: QA_LI, originalLine: b[QA_LI], newLine: fixed, base: qaNeighbors(b, QA_LI) };
  assert.deepEqual(pick(evaluateAbsorption({ texts: main }, ch, { relocationLines: QA_R })).slice(0, 2), [ABSORPTION.CHANGED, 'unlocated_lookalike_unresolved']);
});

test('C2b: "נקלט" מעוגן בלי הבסיס המלא (לא נקרא) → changed:base_required; עם הבסיס — נקלט', () => {
  const b = qaBase();
  b[QA_LI] = `${qaFill(130)} ${QA_ERR} tail`;
  const fixed = b[QA_LI].replace(QA_ERR, QA_OK);
  const main = [...b];
  main[QA_LI] = fixed;
  const noBase = qaRun(main, b, QA_LI, b[QA_LI], fixed, { baseReadable: false });
  assert.deepEqual([noBase.outcome, noBase.detail, noBase.anchored], [ABSORPTION.CHANGED, 'base_required', true], JSON.stringify(noBase));
  assert.equal(qaRun(main, b, QA_LI, b[QA_LI], fixed).outcome, ABSORPTION.ABSORBED);
});

test("C5 (S1'): כותרת כפולה והזזה של יותר מ-50 שורות — בלי הבסיס המלא לא נסגר", () => {
  const b = qaBase();
  b[10] = '<h3>11</h3>';
  b[QA_LI] = '<h3>11</h3>';
  b[QA_LI + 60] = '<h3>12</h3>';
  const main = qaDel(b, 20, 60);
  const withBase = qaRun(main, b, QA_LI, '<h3>11</h3>', '<h3>12</h3>');
  assert.deepEqual([withBase.outcome, withBase.detail], [ABSORPTION.CHANGED, 'fix_not_new']);
  const noBase = qaRun(main, b, QA_LI, '<h3>11</h3>', '<h3>12</h3>', { baseReadable: false });
  assert.notEqual(noBase.outcome, ABSORPTION.ABSORBED, JSON.stringify(noBase));
});

test('A: הפסקה המקורית זזה מעבר לחלון ונשארה שלמה — מופע אחר של הנוסח המתוקן אינו הופך את הדיווח ל"נקלט"', () => {
  const b = qaBase();
  b[QA_LI] = `${qaFill(130)} ${QA_ERR} tail`;
  const fixed = b[QA_LI].replace(QA_ERR, QA_OK);
  // ביעד כעת פסקה אחרת שנושאת את הנוסח המתוקן; הפסקה המקורית (עם השגיאה) זזה 80 שורות והשגיאה עודנה בספר
  const main = [...b];
  main[QA_LI] = `intro ${QA_OK} outro`;
  main[QA_LI + 80] = b[QA_LI];
  for (const baseReadable of [true, false]) {
    const v = qaRun(main, b, QA_LI, b[QA_LI], fixed, { baseReadable });
    assert.notEqual(v.outcome, ABSORPTION.ABSORBED, JSON.stringify(v));
  }
  const v = qaRun(main, b, QA_LI, b[QA_LI], fixed);
  assert.deepEqual([v.outcome, v.detail], [ABSORPTION.PENDING, 'original_elsewhere']);
  // ללא המופע הרחוק של המקור — אותו קובץ נקלט (ההבדל היחיד)
  const clean = [...main];
  clean[QA_LI + 80] = qaFill(999);
  assert.equal(qaRun(clean, b, QA_LI, b[QA_LI], fixed).outcome, ABSORPTION.ABSORBED);
  // שורת היעד עצמה נקיה אך עריכה (לא שורה שלמה): המקור רחוק בהקשר אחר
  assert.equal(closedPrAction(v, { closedAt: new Date(0), now: new Date(1000), graceSeconds: 10_000 }), CLOSED_PR_ACTION.AWAIT);
  assert.equal(closedPrAction(v, { closedAt: new Date(0), now: new Date(20_000_000), graceSeconds: 10 }), CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED);
});

test('R3 (סוקר, סבב 3): הפסקה זזה ומילים ליד הטעות שונו, ושורה אחרת בבסיס כבר נשאה את ההצעה — לא "נקלט"', () => {
  const b = qaBase();
  b[QA_LI] = `${qaFill(130)} ${QA_ERR} tail`;
  b[240] = `${qaFill(240)} ${QA_OK} more`; // שורה אחרת שכבר נושאת את הנוסח המוצע (מחוץ לחלון הבסיס)
  const fixed = b[QA_LI].replace(QA_ERR, QA_OK);
  // מנהל הספרייה הזיז את הפסקה ושינה מילים צמודות לטעות — בלי לתקן אותה — ומחק 70 שורות אחריה
  const moved = b[QA_LI].replace('they nouelin money', 'thei nouelin monei');
  const main = [...b];
  main.splice(QA_LI, 71);
  main.splice(20, 0, moved);
  for (const baseReadable of [true, false]) {
    const v = qaRun(main, b, QA_LI, b[QA_LI], fixed, { baseReadable });
    assert.notEqual(v.outcome, ABSORPTION.ABSORBED, JSON.stringify(v));
  }
  assert.deepEqual(pick(qaRun(main, b, QA_LI, b[QA_LI], fixed)).slice(0, 2), [ABSORPTION.CHANGED, 'unlocated_lookalike_unresolved']);
  // ביקורת: אותה הזזה כשהמילים ליד הטעות שונו וגם הטעות תוקנה — עדיין ספק (המיפוי סביב הטעות אינו ודאי);
  // הזזה ותיקון בלי עריכה צמודה — נקלט: הפסקה המדווחת עצמה זוהתה ותוקנה, והשורה שכבר נשאה את ההצעה היא תאום מהבסיס
  const nearFixed = main.map((l) => (l === moved ? moved.replace('nouelin', 'notelin') : l));
  assert.notEqual(qaRun(nearFixed, b, QA_LI, b[QA_LI], fixed).outcome, ABSORPTION.ABSORBED);
  const movedFixed = main.map((l) => (l === moved ? fixed : l));
  assert.equal(qaRun(movedFixed, b, QA_LI, b[QA_LI], fixed).outcome, ABSORPTION.ABSORBED);
});

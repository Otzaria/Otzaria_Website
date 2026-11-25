/**
 * בדיקות הכלל הטהור ל-PR שנסגר בלי מיזוג: האם התיקון נקלט ב-main, והמעבר שנגזר ממנו. הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAbsorption, closedPrAction, handoffReasonOf, lineEdit, editState, ABSORPTION, CLOSED_PR_ACTION, PR_CLOSED_HANDOFF } from './absorption.js';
import { deriveLabels } from './labels.js';
import { HANDOFF_REASON_LABELS } from './states.js';

const L0 = '<h1>בראשית</h1>';
const OLD = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const NEW = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים';
const CHANGE = { lineIndex: 2, originalLine: OLD, newLine: NEW };
const file = (lines, eol = '\r\n') => ({ content: lines.join(eol) + eol, lossy: false });
const check = (lines, change = CHANGE, relocationLines = 50) => evaluateAbsorption(file(lines), change, { relocationLines });
const filler = (n) => Array.from({ length: n }, (_, i) => `שורה ${i}`);

test('נקלט: השורה ביעד היא השורה החדשה', () => {
  assert.deepEqual(check([L0, '', NEW, 'סוף']), { outcome: ABSORPTION.ABSORBED, detail: 'applied', lineIndex: 2, relocated: false });
});

test('ממתין: השורה המקורית עדיין ביעד', () => {
  assert.deepEqual(check([L0, '', OLD, 'סוף']), { outcome: ABSORPTION.PENDING, detail: 'original_in_place', lineIndex: 2, relocated: false });
});

test('ממתין: השורה המקורית זזה (נוספו שורות לפניה) והחדשה אינה בקובץ', () => {
  assert.deepEqual(check([L0, 'א', 'ב', '', OLD, 'סוף']), { outcome: ABSORPTION.PENDING, detail: 'original_relocated', lineIndex: 4, relocated: true });
});

test('נקלט אחרי הזזה: החדשה פעם אחת בטווח והמקורית אינה בקובץ; רחוק מהטווח → ידני', () => {
  assert.deepEqual(check([L0, 'א', '', NEW, 'סוף']), { outcome: ABSORPTION.ABSORBED, detail: 'applied_relocated', lineIndex: 3, relocated: true });
  const far = check([L0, ...filler(60), '', NEW, 'סוף']);
  assert.equal(far.outcome, ABSORPTION.CHANGED);
  assert.equal(far.detail, 'applied_too_far');
  // בלי טווח הזזה — רק השורה עצמה נחשבת
  assert.equal(check([L0, 'א', '', NEW, 'סוף'], CHANGE, 0).outcome, ABSORPTION.CHANGED);
});

test('השורה שונתה אחרת → ידני; עמימות → ידני (אף פעם לא "נקלט")', () => {
  assert.deepEqual(check([L0, '', 'נוסח אחר', 'סוף']), { outcome: ABSORPTION.CHANGED, detail: 'line_changed', lineIndex: null, relocated: false });
  assert.equal(check([OLD, '', 'נוסח אחר', OLD]).detail, 'ambiguous', 'המקורית פעמיים בקובץ');
  assert.equal(check([L0, NEW, 'נוסח אחר', OLD]).detail, 'ambiguous', 'המקורית זזה וגם החדשה ליד היעד');
  assert.equal(check([L0, NEW, 'נוסח אחר', NEW]).detail, 'ambiguous', 'החדשה פעמיים בקובץ');
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
  assert.equal(check([L0, '', '', 'סוף'], del).outcome, ABSORPTION.ABSORBED);
  assert.equal(check([L0, '', OLD, ''], del).outcome, ABSORPTION.PENDING);
  assert.equal(check([L0, 'א', 'ב', '', OLD, ''], del).outcome, ABSORPTION.PENDING, 'שורות ריקות רבות אינן עמימות כשהמקורית זזה');
  // שורה ריקה שזזה אל היעד אינה ראיה לקליטה כשהמקורית עדיין בקובץ
  assert.deepEqual(check([L0, 'א', '', OLD, 'סוף'], del), { outcome: ABSORPTION.CHANGED, detail: 'ambiguous', lineIndex: null, relocated: false });
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
  assert.deepEqual(evaluateAbsorption(both, A), { outcome: ABSORPTION.ABSORBED, detail: 'edit_applied', lineIndex: 1, relocated: false });
  assert.equal(evaluateAbsorption(both, B).outcome, ABSORPTION.ABSORBED);
  const onlyB = file(['כותרת', fixB(LONG), 'סוף']);
  assert.deepEqual(evaluateAbsorption(onlyB, A), { outcome: ABSORPTION.PENDING, detail: 'edit_pending', lineIndex: 1, relocated: false });
  const otherWording = file(['כותרת', LONG.replace('הלכא', 'הילכתא'), 'סוף']);
  assert.equal(evaluateAbsorption(otherWording, A).detail, 'line_changed', 'תוקן אחרת → ידני');
  // השורה זזה: העריכה בהקשרה נמצאת בטווח
  const moved = file(['כותרת', 'הקדמה', 'עוד', fixB(fixA(LONG)), 'סוף']);
  assert.deepEqual(evaluateAbsorption(moved, A, { relocationLines: 50 }), { outcome: ABSORPTION.ABSORBED, detail: 'edit_applied_relocated', lineIndex: 3, relocated: true });
  assert.equal(evaluateAbsorption(file(['כותרת', 'הקדמה', fixB(LONG), 'סוף']), A, { relocationLines: 50 }).detail, 'edit_pending_relocated');
});

test('אותו ביטוי פעמיים בשורה, אחד תוקן והשני לא → עמימות → ידני', () => {
  const REP = 'אמר רבי יוחנן הלכא כרבי מאיר בזו. ושוב אמר רבי יוחנן הלכא כרבי מאיר בזו. סוף';
  const change = { lineIndex: 0, originalLine: REP, newLine: REP.replace('הלכא', 'הלכה') };
  const target = file([`${change.newLine} דבר`]);
  assert.equal(editState(target.content.trimEnd(), lineEdit(REP, change.newLine)), 'both');
  assert.equal(evaluateAbsorption(target, change).detail, 'ambiguous');
});

test('המעבר: נקלט → סגירה; השתנה → ידני מיד; ממתין → המתנה עד תום הזמן ואז ידני', () => {
  const closedAt = new Date('2026-11-01T00:00:00Z');
  const at = (sec) => ({ closedAt, now: new Date(closedAt.getTime() + sec * 1000), graceSeconds: 100 });
  assert.equal(closedPrAction({ outcome: ABSORPTION.ABSORBED }, at(10_000)), CLOSED_PR_ACTION.CLOSE_ABSORBED);
  assert.equal(closedPrAction({ outcome: ABSORPTION.CHANGED }, at(0)), CLOSED_PR_ACTION.HANDOFF_CHANGED);
  assert.equal(closedPrAction({ outcome: ABSORPTION.PENDING }, at(0)), CLOSED_PR_ACTION.AWAIT);
  assert.equal(closedPrAction({ outcome: ABSORPTION.PENDING }, at(99)), CLOSED_PR_ACTION.AWAIT);
  assert.equal(closedPrAction({ outcome: ABSORPTION.PENDING }, at(100)), CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED);
  assert.equal(handoffReasonOf(CLOSED_PR_ACTION.HANDOFF_CHANGED), PR_CLOSED_HANDOFF.CHANGED);
  assert.equal(handoffReasonOf(CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED), PR_CLOSED_HANDOFF.NOT_ABSORBED);
  assert.equal(handoffReasonOf(CLOSED_PR_ACTION.AWAIT), null);
});

test('תוויות: PR שנסגר וממתין לקליטה, וסיבות ההעברה לידני החדשות', () => {
  const t = (r) => deriveLabels(r).map((l) => l.text);
  assert.deepEqual(t({ publish: { status: 'pr_opened', prClosedAt: new Date() } }), ['ה-PR נסגר — ממתין לקליטה ב-main']);
  assert.deepEqual(t({ publish: { status: 'pr_opened' } }), ['נפתח PR (טרם מוזג)']);
  assert.ok(t({ publish: { status: 'failed', conflictReason: PR_CLOSED_HANDOFF.CHANGED }, manual: { handoffReason: PR_CLOSED_HANDOFF.CHANGED } }).includes('התנגשות'));
  for (const reason of Object.values(PR_CLOSED_HANDOFF)) assert.ok(HANDOFF_REASON_LABELS[reason], reason);
});

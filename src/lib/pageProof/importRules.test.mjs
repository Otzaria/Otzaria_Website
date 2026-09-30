import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_STATUSES,
  incomingRevision,
  storedRevision,
  submissionRevision,
  sameRevision,
  revisionFilter,
  isAnswered,
  startedPage,
  UNANSWERED_FILTER,
  notStartedFilter,
  canReplacePage,
  importAction,
  RECUT_RESET,
  requiredForPage,
  planSequences,
  statusAfterApprove,
  statusAfterReject,
  statusWhenFull,
  statusAfterReleaseRecut,
  importSummaryParts,
} from './importRules.js';
import { requiredFor } from './sequences.js';

const NOW = new Date('2026-09-29T12:00:00Z');
const HOUR = 3600 * 1000;
const P = (page, extra = {}) => ({
  _id: `id${page}`,
  page,
  seq: 0,
  required: 1,
  revision: 1,
  activeCount: 0,
  approvedCount: 0,
  leasedUntil: null,
  status: 'open',
  ...extra,
});
const byId = (list) => Object.fromEntries(list.map((u) => [u._id, u.seq]));

test('PAGE_STATUSES כולל את recut', () => {
  assert.deepEqual(PAGE_STATUSES, ['open', 'done', 'recut']);
});

test('גרסאות: חסר/לא תקין = 1, והשוואה מנרמלת', () => {
  assert.equal(incomingRevision({}), 1);
  assert.equal(incomingRevision(null), 1);
  assert.equal(incomingRevision({ revision: 3 }), 3);
  assert.equal(incomingRevision({ revision: 0 }), 1);
  assert.equal(incomingRevision({ revision: '2' }), 1);
  assert.equal(incomingRevision({ revision: 2.5 }), 1);

  assert.equal(storedRevision({ revision: 2 }), 2);
  assert.equal(storedRevision({}), 1);
  // רק השדה העליון נחשב — הייבוא כותב אותו תמיד
  assert.equal(storedRevision({ doc: { revision: 4 } }), 1);

  assert.equal(submissionRevision({}), 1);
  assert.equal(submissionRevision({ revision: 2 }), 2);

  assert.equal(sameRevision(undefined, 1), true);
  assert.equal(sameRevision(null, undefined), true);
  assert.equal(sameRevision(2, 2), true);
  assert.equal(sameRevision(1, 2), false);
});

test('revisionFilter: גרסה 1 תופסת גם מסמך בלי השדה; בלי $or', () => {
  assert.deepEqual(revisionFilter(1), { revision: { $in: [1, null] } });
  assert.deepEqual(revisionFilter(undefined), { revision: { $in: [1, null] } });
  assert.deepEqual(revisionFilter(3), { revision: 3 });
  for (const r of [1, 2, undefined]) assert.equal(Object.hasOwn(revisionFilter(r), '$or'), false);
});

test('isAnswered / startedPage', () => {
  assert.equal(isAnswered(P(1)), false);
  assert.equal(isAnswered(P(1, { activeCount: 1 })), true);
  assert.equal(isAnswered(P(1, { approvedCount: 1 })), true);
  assert.equal(isAnswered(P(1, { activeCount: -1 })), false);
  assert.equal(isAnswered({}), false);

  assert.equal(startedPage(P(1), NOW), false);
  assert.equal(startedPage(P(1, { activeCount: 1 }), NOW), true);
  assert.equal(startedPage(P(1, { approvedCount: 2 }), NOW), true);
  // החכרה בתוקף = התחיל; החכרה שפגה = לא
  assert.equal(startedPage(P(1, { leasedUntil: new Date(NOW.getTime() + HOUR) }), NOW), true);
  assert.equal(startedPage(P(1, { leasedUntil: new Date(NOW.getTime() - HOUR) }), NOW), false);
  assert.equal(startedPage(P(1, { leasedUntil: new Date(NOW.getTime() + HOUR).toISOString() }), NOW), true);
  assert.equal(startedPage(P(1, { leasedUntil: 'לא תאריך' }), NOW), false);
});

test('מסנני-Mongo תואמים לכללים', () => {
  assert.deepEqual(UNANSWERED_FILTER, { activeCount: { $not: { $gt: 0 } }, approvedCount: { $not: { $gt: 0 } } });
  const f = notStartedFilter(NOW);
  assert.deepEqual(f.$or, [{ leasedUntil: null }, { leasedUntil: { $lte: NOW } }]);
  assert.deepEqual(f.activeCount, { $not: { $gt: 0 } });
  assert.deepEqual(f.approvedCount, { $not: { $gt: 0 } });
});

test('canReplacePage: רק עמוד שממתין לזיהוי-מחדש, ורק בגרסה חדשה יותר', () => {
  const recut = P(1, { status: 'recut', approvedCount: 1, activeCount: 1 });
  assert.equal(canReplacePage(recut, { revision: 2 }), true);
  assert.equal(canReplacePage(recut, { revision: 1 }), false);
  assert.equal(canReplacePage(recut, {}), false);
  assert.equal(canReplacePage({ ...recut, revision: 2 }, { revision: 2 }), false);
  assert.equal(canReplacePage({ ...recut, revision: 2 }, { revision: 3 }), true);
  // עמוד שהוגש ואושר בלי שינוי-חיתוך — לא מוחלף גם בגרסה חדשה
  assert.equal(canReplacePage(P(1, { status: 'done', approvedCount: 1 }), { revision: 5 }), false);
  assert.equal(canReplacePage(undefined, { revision: 2 }), false);
});

test('importAction: כל המקרים', () => {
  assert.equal(importAction(undefined, { page: 1 }), 'create');
  assert.equal(importAction(P(1), { page: 1 }), 'update');
  // מוחכר אבל לא הוגש — מתעדכן (כמו תמיד)
  assert.equal(importAction(P(1, { leasedUntil: new Date(NOW.getTime() + HOUR) }), { page: 1 }), 'update');
  assert.equal(importAction(P(1, { activeCount: 1 }), { page: 1 }), 'skip-answered');
  assert.equal(importAction(P(1, { status: 'done', activeCount: 1, approvedCount: 1 }), { page: 1, revision: 2 }), 'skip-answered');
  const recut = P(1, { status: 'recut', activeCount: 1, approvedCount: 1 });
  assert.equal(importAction(recut, { page: 1, revision: 2 }), 'recut');
  assert.equal(importAction(recut, { page: 1 }), 'skip-recut');
  assert.equal(importAction({ ...recut, revision: 2 }, { page: 1, revision: 2 }), 'skip-recut');
  // חבילה ישנה מזו שבאתר — לא דורסת, גם עמוד שאיש לא הגיש
  assert.equal(importAction(P(1, { revision: 2 }), { page: 1, revision: 1 }), 'skip-older');
  assert.equal(importAction(P(1, { revision: 2 }), { page: 1 }), 'skip-older');
  assert.equal(importAction({ ...recut, revision: 3 }, { page: 1, revision: 2 }), 'skip-older');
  // עמוד שלא נענה בגרסה חדשה יותר — מתעדכן
  assert.equal(importAction(P(1), { page: 1, revision: 2 }), 'update');
});

test('RECUT_RESET: מאפס מונים, מגישים והחכרה, ונפתח עם הגשה אחת', () => {
  assert.deepEqual({ ...RECUT_RESET }, {
    status: 'open',
    activeCount: 0,
    approvedCount: 0,
    submitters: [],
    required: 1,
    leasedBy: null,
    leasedUntil: null,
  });
  assert.equal(Object.isFrozen(RECUT_RESET), true);
});

test('requiredForPage: לפי הרצף, ומעבר שני תמיד 1', () => {
  assert.equal(requiredForPage({ gid: 'gidgidgid', seq: 3, revision: 1 }, 100), 2);
  assert.equal(requiredForPage({ gid: 'gidgidgid', seq: 3 }, 100), 2);
  assert.equal(requiredForPage({ gid: 'gidgidgid', seq: 3, revision: 2 }, 100), 1);
  assert.equal(requiredForPage({ gid: 'gidgidgid', seq: 3, revision: 1 }, 0), 1);
  for (let s = 0; s < 20; s++) assert.equal(requiredForPage({ gid: 'abcdefgh', seq: s }, 10), requiredFor('abcdefgh', s, 10));
});

test('planSequences: ספר חדש — רצפים של 5 לפי מספר-העמוד, רק מה שהשתנה', () => {
  const pages = [1, 2, 3, 4, 5, 6, 7].map((p) => P(p, { seq: 0 }));
  const plan = planSequences(pages, { gid: 'gidgidgid', doublePct: 0, now: NOW });
  // 1–5 כבר ברצף 0 (ו-required 1) — לא ברשימה; 6–7 עוברים לרצף 1
  assert.deepEqual(byId(plan), { id6: 1, id7: 1 });
  assert.ok(plan.every((u) => u.required === 1));
});

test('planSequences: עמוד שהתחיל (הגשה/החכרה) שומר את רצפו ואינו ברשימה', () => {
  const pages = [
    ...[1, 2, 3, 4, 5].map((p) => P(p, { seq: 7, activeCount: 1 })),
    P(6, { seq: 9, leasedUntil: new Date(NOW.getTime() + HOUR) }),
    P(7, { seq: 9, leasedUntil: new Date(NOW.getTime() - HOUR) }),
  ];
  const plan = planSequences(pages, { gid: 'gidgidgid', doublePct: 0, now: NOW });
  const ids = plan.map((u) => u._id);
  assert.ok(!ids.some((i) => ['id1', 'id2', 'id3', 'id4', 'id5', 'id6'].includes(i)));
  // עמוד 7 (החכרה שפגה) — לא התחיל. יעדו רצף 1; המספר 1 פנוי ← 1
  assert.deepEqual(byId(plan), { id7: 1 });
});

test('planSequences: עמוד שחזר מזיהוי-מחדש מצטרף לרצף של שכניו, בהגשה אחת', () => {
  const pages = [1, 2, 3, 4, 5].map((p) => P(p, { seq: 0, status: 'done', activeCount: 1, approvedCount: 1 }));
  // עמוד 3 הוחלף (גרסה 2, מונים אופסו) — כבר ברצף 0 עם required 1: אין מה לעדכן
  pages[2] = P(3, { seq: 0, revision: 2, required: 1 });
  assert.deepEqual(planSequences(pages, { gid: 'gidgidgid', doublePct: 100, now: NOW }), []);
  // ואם נשמר בו required ישן (2) — מתוקן ל-1 בלי לשנות רצף
  pages[2] = P(3, { seq: 0, revision: 2, required: 2 });
  assert.deepEqual(planSequences(pages, { gid: 'gidgidgid', doublePct: 100, now: NOW }), [{ _id: 'id3', page: 3, seq: 0, required: 1 }]);
});

test('planSequences: required מחושב מחדש לעמודים שלא התחילו (כפול ב-100%)', () => {
  const pages = [1, 2].map((p) => P(p, { seq: 0, required: 1 }));
  const plan = planSequences(pages, { gid: 'gidgidgid', doublePct: 100, now: NOW });
  assert.deepEqual(plan.map((u) => [u._id, u.seq, u.required]), [['id1', 0, 2], ['id2', 0, 2]]);
});

test('planSequences: expectPages — עמודים שיגיעו אחר כך משתתפים בדירוג ולא נכתבים', () => {
  // עמודי-קישור 1,2,4,5,6,8,9,10; עמודים 3 ו-7 יועלו אחר כך ב-ZIP
  const linked = [1, 2, 4, 5, 6, 8, 9, 10].map((p) => P(p, { seq: 99 }));
  const alone = byId(planSequences(linked, { gid: 'gidgidgid', doublePct: 0, now: NOW }));
  // בלי הצפי — עמוד 6 היה נופל לרצף 0 עם 1–5
  assert.equal(alone.id6, 0);
  const whole = byId(planSequences(linked, { gid: 'gidgidgid', doublePct: 0, now: NOW, expectPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }));
  assert.deepEqual(whole, { id1: 0, id2: 0, id4: 0, id5: 0, id6: 1, id8: 1, id9: 1, id10: 1 });
  // עמוד שכבר במסד אינו נספר פעמיים; ערכים לא-מספריים מתעלמים
  const dup = byId(planSequences(linked, { gid: 'gidgidgid', doublePct: 0, now: NOW, expectPages: [1, 1, 3, 'x', null, 7] }));
  assert.deepEqual(dup, whole);
});

test('planSequences: עמוד חדש (בלי seq/required) תמיד ברשימה; קלט ריק', () => {
  const plan = planSequences([P(1, { _id: 'new:1', seq: null, required: null })], { gid: 'gidgidgid', doublePct: 0, now: NOW });
  assert.deepEqual(plan, [{ _id: 'new:1', page: 1, seq: 0, required: 1 }]);
  assert.deepEqual(planSequences([], { gid: 'g' }), []);
  assert.deepEqual(planSequences(null, { gid: 'g' }), []);
  assert.deepEqual(planSequences([{ _id: 'x' }], { gid: 'g' }), []);
});

test('planSequences: מזהי ObjectId (אובייקטים) — המפה לפי אותה הפניה', () => {
  class Oid {
    constructor(h) { this.h = h; }
    toString() { return this.h; }
  }
  const pages = [1, 2, 3, 4, 5, 6].map((p) => P(p, { _id: new Oid(`aa${p}`), seq: 5 }));
  const plan = planSequences(pages, { gid: 'gidgidgid', doublePct: 0, now: NOW });
  assert.equal(plan.length, 6);
  assert.ok(plan.every((u) => pages.some((p) => p._id === u._id)));
  assert.deepEqual(plan.map((u) => u.seq), [0, 0, 0, 0, 0, 1]);
});

test('statusAfterApprove / statusAfterReject', () => {
  assert.equal(statusAfterApprove('done', true), 'recut');
  assert.equal(statusAfterApprove('open', true), 'recut');
  assert.equal(statusAfterApprove('done', false), 'done');
  assert.equal(statusAfterApprove('open', false), 'open');
  assert.equal(statusAfterApprove('recut', false), 'recut');

  assert.equal(statusAfterReject('done', false), 'open');
  assert.equal(statusAfterReject('open', true), 'open');
  assert.equal(statusAfterReject('recut', true), 'recut');
  assert.equal(statusAfterReject('recut', false), 'open');
});

test('importSummaryParts: חלקים בעברית, רק מה שיש', () => {
  assert.deepEqual(importSummaryParts({ created: 3, updated: 0 }), ['3 עמודים חדשים', '0 עודכנו']);
  const all = importSummaryParts({ created: 1, updated: 2, recut: 3, linked: 4, skippedAnswered: 5, skippedRecut: 6, skippedOlder: 7 });
  assert.equal(all.length, 7);
  assert.match(all[2], /^3 חזרו מזיהוי-מחדש/);
  assert.match(all[3], /^4 מקושרים/);
  assert.match(all[4], /^5 דולגו \(כבר הוגשו\)$/);
  assert.match(all[5], /^6 ממתינים לזיהוי-מחדש/);
  assert.match(all[6], /^7 דולגו — בחבילה גרסה ישנה/);
  assert.deepEqual(importSummaryParts(null), ['0 עמודים חדשים', '0 עודכנו']);
});

test('statusAfterApprove: עמוד כפול שחסרה לו הגשה — נשאר פתוח (לא מגרשים את הבודק השני); מלא — recut', () => {
  assert.equal(statusAfterApprove('open', true, { activeCount: 1, required: 2 }), 'open');
  assert.equal(statusAfterApprove('open', true, { activeCount: 2, required: 2 }), 'recut');
  assert.equal(statusAfterApprove('done', true, { activeCount: 2, required: 2 }), 'recut');
  assert.equal(statusAfterApprove('open', false, { activeCount: 1, required: 2 }), 'open');
  assert.equal(statusWhenFull(true), 'recut');
  assert.equal(statusWhenFull(false), 'done');
});

test('statusAfterReleaseRecut: שחרור מהמתנה — הושלם, או פתוח לבודק נוסף', () => {
  assert.equal(statusAfterReleaseRecut({ activeCount: 1, required: 1 }), 'done');
  assert.equal(statusAfterReleaseRecut({ activeCount: 1, required: 2 }), 'open');
  assert.equal(statusAfterReleaseRecut({}), 'open');
});

test('importAction: גרסה חדשה לעמוד שממתין — מדולגת כשתיקון-חיתוך מאושר שלו עוד לא הורד', () => {
  const recut = P(1, { status: 'recut', activeCount: 1, approvedCount: 1 });
  assert.equal(importAction({ ...recut, unexportedRecut: true }, { page: 1, revision: 2 }), 'skip-unexported');
  assert.equal(importAction({ ...recut, unexportedRecut: false }, { page: 1, revision: 2 }), 'recut');
  // בלי גרסה חדשה — כמו קודם
  assert.equal(importAction({ ...recut, unexportedRecut: true }, { page: 1 }), 'skip-recut');
  const parts = importSummaryParts({ created: 0, updated: 0, skippedUnexported: 2 });
  assert.match(parts[2], /^2 לא הוחלפו/);
});

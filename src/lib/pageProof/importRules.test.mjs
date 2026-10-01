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
  GATEWAY_POLL_MS,
  GATEWAY_WAIT_MS,
  isGatewayTimeout,
  importSnapshot,
  finishedImport,
  importFinishedLine,
  importFileErrors,
  mergeImportResults,
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

// ---------- ייבוא קובץ-קובץ, ושער שהפסיק לחכות ----------

const BOOK = (gid, lastImportAt, extra = {}) => ({ gid, title: `ספר ${gid}`, pageCount: 10, lineCount: 400, lastImportAt, ...extra });

test('isGatewayTimeout: 502/503/504 — השער הפסיק לחכות; כל השאר לא', () => {
  for (const s of [502, 503, 504, '504']) assert.equal(isGatewayTimeout(s), true, String(s));
  for (const s of [200, 400, 413, 500, undefined, null]) assert.equal(isGatewayTimeout(s), false, String(s));
  assert.equal(GATEWAY_POLL_MS, 10000);
  assert.equal(GATEWAY_WAIT_MS, 600000);
});

test('importSnapshot: {gid: lastImportAt}; ספר בלי תאריך — null', () => {
  assert.deepEqual(importSnapshot([BOOK('a1', '2026-09-30T08:00:00.000Z'), BOOK('b2', undefined), { title: 'בלי gid' }]), {
    a1: '2026-09-30T08:00:00.000Z',
    b2: null,
  });
  assert.deepEqual(importSnapshot(null), {});
});

test('finishedImport: תאריך-ייבוא חדש מהתצלום, או ספר חדש שכבר יש לו תאריך — האחרון שהסתיים', () => {
  const before = importSnapshot([BOOK('a1', '2026-09-30T08:00:00.000Z'), BOOK('b2', null)]);
  // שום דבר לא השתנה
  assert.equal(finishedImport(before, [BOOK('a1', '2026-09-30T08:00:00.000Z'), BOOK('b2', null)]), null);
  // הייבוא של a1 הסתיים
  const a1 = BOOK('a1', '2026-09-30T08:01:10.000Z', { pageCount: 92, lineCount: 5000 });
  assert.equal(finishedImport(before, [a1, BOOK('b2', null)]), a1);
  // ספר שלא היה לו תאריך — עכשיו יש
  const b2 = BOOK('b2', '2026-09-30T08:02:00.000Z');
  assert.equal(finishedImport(before, [BOOK('a1', '2026-09-30T08:00:00.000Z'), b2]), b2);
  // ספר חדש: נוצר בתחילת הייבוא בלי תאריך — עדיין לא; כשהתאריך נכתב (בסוף) — כן
  assert.equal(finishedImport(before, [BOOK('c3', undefined)]), null);
  const c3 = BOOK('c3', '2026-09-30T08:03:00.000Z');
  assert.equal(finishedImport(before, [BOOK('a1', '2026-09-30T08:00:00.000Z'), c3]), c3);
  // כמה שהסתיימו — האחרון
  assert.equal(finishedImport(before, [a1, b2, c3]), c3);
  // תאריך פגום — לא נחשב; בלי תצלום — אי-אפשר לדעת
  assert.equal(finishedImport(before, [BOOK('a1', 'לא-תאריך')]), null);
  assert.equal(finishedImport(null, [c3]), null);
  assert.equal(finishedImport(before, null), null);
});

test('importFinishedLine: "הייבוא הסתיים: שם · N עמודים · M שורות"', () => {
  assert.equal(importFinishedLine(BOOK('a1', null, { title: 'ספר א', pageCount: 92, lineCount: 5000 })), 'הייבוא הסתיים: ספר א · 92 עמודים · 5000 שורות');
  assert.equal(importFinishedLine({ gid: 'x9' }), 'הייבוא הסתיים: x9 · 0 עמודים · 0 שורות');
});

test('importFileErrors: שגיאות השרת כמות-שהן, שגיאה יחידה עם שם הקובץ, ותשובה שאינה JSON', () => {
  assert.deepEqual(importFileErrors('א.zip', { success: false, results: [], errors: ['א.zip: קובץ ה-ZIP פגום'] }, 200), ['א.zip: קובץ ה-ZIP פגום']);
  assert.deepEqual(importFileErrors('א.zip', { error: 'הייבוא נכשל' }, 500), ['א.zip: הייבוא נכשל']);
  assert.deepEqual(importFileErrors('א.zip', null, 413), ['א.zip: שגיאת שרת (413)']);
  assert.deepEqual(importFileErrors('א.zip', { success: true, results: [{ gid: 'a1' }], errors: [] }, 200), []);
});

test('mergeImportResults: ספר בכמה קבצים — שורה אחת, המונים מסתכמים והשגיאות מצטרפות; ספרים שונים — בסדר הופעתם', () => {
  const merged = mergeImportResults([
    { gid: 'a1', title: 'ספר א', created: 30, updated: 0, recut: 1, errors: ['עמוד 3: שגיאה'] },
    { gid: 'b2', title: 'ספר ב', created: 5, updated: 2, errors: [] },
    { gid: 'a1', title: 'ספר א', created: 32, updated: 4, skippedAnswered: 2, errors: ['עמוד 40: שגיאה'] },
    { title: 'בלי gid' },
  ]);
  assert.deepEqual(
    merged.map((r) => [r.gid, r.created, r.updated, r.recut, r.skippedAnswered, r.errors]),
    [
      ['a1', 62, 4, 1, 2, ['עמוד 3: שגיאה', 'עמוד 40: שגיאה']],
      ['b2', 5, 2, undefined, undefined, []],
    ]
  );
  assert.deepEqual(importSummaryParts(merged[0]).slice(0, 2), ['62 עמודים חדשים', '4 עודכנו']);
  assert.deepEqual(mergeImportResults(null), []);
});

test('importSummaryParts / mergeImportResults: עמודים שחזרו למתנדב שביקש את הזיהוי-מחדש', () => {
  assert.equal(importSummaryParts({ created: 0, updated: 0, recut: 3, recutReturned: 1 })[2], '3 חזרו מזיהוי-מחדש ונפתחו למעבר שני (אחד מהם חזר למתנדב שביקש את הזיהוי-מחדש)');
  assert.equal(importSummaryParts({ recut: 3, recutReturned: 2 })[2], '3 חזרו מזיהוי-מחדש ונפתחו למעבר שני (2 מהם חזרו למתנדב שביקש את הזיהוי-מחדש)');
  assert.equal(importSummaryParts({ recut: 2 })[2], '2 חזרו מזיהוי-מחדש ונפתחו למעבר שני');
  const [m] = mergeImportResults([
    { gid: 'g', recut: 1, recutReturned: 1, errors: [] },
    { gid: 'g', recut: 2, recutReturned: 1, errors: [] },
  ]);
  assert.equal(m.recutReturned, 2);
});

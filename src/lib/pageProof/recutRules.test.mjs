/**
 * בקשת מתנדב לזיהוי-מחדש — הכללים הטהורים (recutRules.js): רק פעולות-החיתוך נשלחות, באותה בדיקה
 * של הגשה; מתי מותר לשלוח עמוד; המסנן האטומי; התפיסה שחוזרת למבקש; ומי המבקש.
 * הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaseEnd } from './lease.js';
import {
  MAX_PENDING_RECUT,
  RECUT_MSG,
  CLAIM_BACK_MS,
  isCutOp,
  recutRequestOps,
  recutRefusal,
  recutEligibleFilter,
  claimBack,
  requesterOf,
  RECUT_MODES,
  AUTO_MINUTES,
  normalizeProofRuntime,
  proofRuntimePatch,
  recutEffective,
  seenAgoLabel,
} from './recutRules.js';

const line = (id, extra = {}) => ({ id, bbox: [100, id * 50, 900, id * 50 + 40], text: `שורה ${id}`, stream: 'main', ...extra });
const DOC = { page: 4, size: [1000, 2000], lines: [line(1), line(2), line(3)] };
const HOUR = 3600 * 1000;
const NOW = new Date('2026-09-30T12:00:00Z');
const later = (h) => new Date(NOW.getTime() + h * HOUR);

test('isCutOp: פיצול, איחוד, שורה חדשה ותיבה — ורק הם', () => {
  for (const k of ['line_split', 'line_merge', 'line_add', 'bbox']) assert.ok(isCutOp({ kind: k }), k);
  for (const k of ['text', 'stream', 'cut_ok', 'status', 'line_ok', undefined]) assert.equal(isCutOp({ kind: k }), false, String(k));
  assert.equal(isCutOp(null), false);
});

test('recutRequestOps: רק פעולות-החיתוך נשמרות — מנוקות ונארזות; טקסט ושאר התיקונים נשארים בחוץ', () => {
  const r = recutRequestOps(DOC, [
    { kind: 'text', page: 4, ids: [1], value: 'תיקון', _g: 'g1' },
    { kind: 'line_split', page: 4, ids: [2], value: { x: 400, junk: 1 }, _g: 'g2' },
    { kind: 'bbox', page: 4, ids: [3], value: [100, 150, 800, 190] },
    { kind: 'bbox', page: 4, ids: [3], value: [100, 150, 850, 190] },
    { kind: 'stream', page: 4, ids: [1], value: 'notes' },
    { kind: 'line_add', page: 4, value: { bbox: [100, 400, 900, 440], text: 'שורה שחסרה' } },
  ]);
  assert.deepEqual(r, {
    ops: [
      { kind: 'line_split', page: 4, ids: [2], value: { x: 400 } },
      // הדחיסה של הגשה: התיבה האחרונה לאותה שורה קובעת
      { kind: 'bbox', page: 4, ids: [3], value: [100, 150, 850, 190] },
      { kind: 'line_add', page: 4, value: { text: 'שורה שחסרה', bbox: [100, 400, 900, 440] } },
    ],
  });
});

test('recutRequestOps: בלי פעולת-חיתוך / פעולה לא תקינה / לא רשימה — שגיאה בעברית', () => {
  assert.deepEqual(recutRequestOps(DOC, [{ kind: 'text', page: 4, ids: [1], value: 'x' }]), { error: RECUT_MSG.noCut });
  assert.deepEqual(recutRequestOps(DOC, []), { error: RECUT_MSG.noCut });
  assert.match(recutRequestOps(DOC, [{ kind: 'line_split', page: 4, ids: [99], value: { x: 400 } }]).error, /שורה שאינה בעמוד הזה/);
  assert.match(recutRequestOps(DOC, [{ kind: 'line_split', page: 4, ids: [1], value: { x: 50 } }]).error, /נקודת-הפיצול/);
  assert.match(recutRequestOps(DOC, [{ kind: 'line_merge', page: 5, ids: [1, 2] }]).error, /לעמוד 5/);
  assert.equal(recutRequestOps(DOC, null).error, 'רשימת תיקונים חסרה');
  assert.ok(/[א-ת]/.test(RECUT_MSG.tooMany) && RECUT_MSG.tooMany.includes(String(MAX_PENDING_RECUT)));
});

test('recutRefusal: רק עמוד פתוח שבטיפול המתנדב, שלא הגיש, ובלי הגשה של אחר', () => {
  const mine = { status: 'open', leasedBy: 'u1', leasedUntil: later(5), submitters: [], activeCount: 0 };
  assert.equal(recutRefusal(mine, 'u1', NOW), null);
  assert.match(recutRefusal({ ...mine, status: 'recut' }, 'u1', NOW), /כבר ממתין לזיהוי-מחדש/);
  assert.match(recutRefusal({ ...mine, status: 'done' }, 'u1', NOW), /הושלם/);
  assert.match(recutRefusal({ ...mine, submitters: ['u1'] }, 'u1', NOW), /כבר הגשתם/);
  assert.match(recutRefusal({ ...mine, leasedBy: 'u2' }, 'u1', NOW), /אינו בטיפולכם/);
  assert.match(recutRefusal({ ...mine, leasedUntil: later(-1) }, 'u1', NOW), /התפיסה פגה/);
  assert.match(recutRefusal({ ...mine, leasedBy: null, leasedUntil: null }, 'u1', NOW), /אינו בטיפולכם/);
  assert.match(recutRefusal({ ...mine, activeCount: 1, required: 2 }, 'u1', NOW), /הגשה של מתנדב אחר/);
  assert.equal(recutRefusal(null, 'u1', NOW), 'העמוד לא נמצא');
});

test('recutEligibleFilter: אותם תנאים, כמסנן לעדכון האטומי (גם הגרסה)', () => {
  assert.deepEqual(recutEligibleFilter('u1', 1, NOW), {
    status: 'open',
    revision: { $in: [1, null] },
    leasedBy: 'u1',
    leasedUntil: { $gt: NOW },
    submitters: { $ne: 'u1' },
    activeCount: { $not: { $gt: 0 } },
  });
  assert.deepEqual(recutEligibleFilter('u1', 3, NOW).revision, 3);
});

test('claimBack: 48 שעות מלאות למבקש — בלי שבת וחג (lease.leaseEnd); בלי מבקש — כלום', () => {
  assert.equal(CLAIM_BACK_MS, 48 * HOUR);
  // יום רביעי רגיל: 48 שעות בדיוק
  const wed = new Date('2026-10-07T07:00:00Z');
  assert.deepEqual(claimBack('u1', wed), { leasedBy: 'u1', leasedUntil: new Date(wed.getTime() + 48 * HOUR) });
  // NOW = רביעי 30.9.2026 15:00 בירושלים: 45 שעות עד שישי 12:00, ואחרי מוצאי שמיני-עצרת/שבת (22:00) — עוד 3
  assert.deepEqual(claimBack('u1', NOW), { leasedBy: 'u1', leasedUntil: leaseEnd(NOW) });
  assert.equal(leaseEnd(NOW).toISOString(), '2026-10-03T22:00:00.000Z');
  assert.deepEqual(claimBack(null, NOW), {});
});

test('requesterOf: הבקשה הממתינה האחרונה — לא בוטלה ולא חזרה', () => {
  const r = (user, at, extra = {}) => ({ _id: `${user}${at}`, user, status: 'approved', recutRequest: true, recutDoneAt: null, createdAt: later(at), ...extra });
  assert.equal(requesterOf([r('a', 1), r('b', 2)]), 'b');
  assert.equal(requesterOf([r('a', 1), r('b', 2, { status: 'rejected' })]), 'a');
  assert.equal(requesterOf([r('a', 1, { recutDoneAt: NOW })]), null);
  assert.equal(requesterOf([r('a', 1, { recutRequest: false })]), null);
  assert.equal(requesterOf([]), null);
  assert.equal(requesterOf(null), null);
});

// מתג המנהל (2026-10-02): פועל / כבוי / אוטומטי — "אוטומטי" = תוכנת-הספר נראתה ב-autoMinutes האחרונות
test('normalizeProofRuntime: ברירת-המחדל "פועל" ו-15 דקות; ערך פגום מתוקן', () => {
  assert.deepEqual(normalizeProofRuntime(), { recutRequests: 'on', autoMinutes: AUTO_MINUTES });
  assert.deepEqual(normalizeProofRuntime({ recutRequests: 'auto', autoMinutes: 30 }), { recutRequests: 'auto', autoMinutes: 30 });
  assert.deepEqual(normalizeProofRuntime({ recutRequests: 'maybe', autoMinutes: 0 }), { recutRequests: 'on', autoMinutes: 15 });
  assert.deepEqual(normalizeProofRuntime(null), { recutRequests: 'on', autoMinutes: 15 });
  assert.deepEqual(RECUT_MODES, ['on', 'off', 'auto']);
});

test('proofRuntimePatch: רק מפתחות מוכרים וערכים תקינים', () => {
  assert.deepEqual(proofRuntimePatch({ recutRequests: 'off', extra: 1 }), { patch: { recutRequests: 'off' } });
  assert.deepEqual(proofRuntimePatch({ autoMinutes: 20 }), { patch: { autoMinutes: 20 } });
  assert.match(proofRuntimePatch({ recutRequests: 'yes' }).error, /on, off או auto/);
  assert.match(proofRuntimePatch({ autoMinutes: 9999 }).error, /בין 1 ל-240/);
  assert.match(proofRuntimePatch({}).error, /אין מה לעדכן/);
  assert.match(proofRuntimePatch(null).error, /אין מה לעדכן/);
});

test('recutEffective: פועל — תמיד; כבוי — אף פעם; אוטומטי — רק כשתוכנת-הספר נראתה לאחרונה', () => {
  const ago = (min) => new Date(NOW.getTime() - min * 60 * 1000);
  assert.equal(recutEffective({ recutRequests: 'on' }, null, NOW), true);
  assert.equal(recutEffective({ recutRequests: 'off' }, ago(0), NOW), false);
  assert.equal(recutEffective({ recutRequests: 'auto' }, ago(14), NOW), true);
  assert.equal(recutEffective({ recutRequests: 'auto' }, ago(16), NOW), false);
  assert.equal(recutEffective({ recutRequests: 'auto', autoMinutes: 30 }, ago(16), NOW), true);
  assert.equal(recutEffective({ recutRequests: 'auto' }, null, NOW), false);
  assert.match(RECUT_MSG.off, /הגישו את העמוד כרגיל עם תיקוני-החיתוך/);
});

test('seenAgoLabel: עכשיו / דקות / שעות / ימים; בלי — "עוד לא נראתה"', () => {
  const ago = (ms) => new Date(NOW.getTime() - ms);
  assert.equal(seenAgoLabel(ago(10 * 1000), NOW), 'עכשיו');
  assert.equal(seenAgoLabel(ago(60 * 1000), NOW), 'לפני דקה');
  assert.equal(seenAgoLabel(ago(7 * 60 * 1000), NOW), 'לפני 7 דקות');
  assert.equal(seenAgoLabel(ago(HOUR), NOW), 'לפני שעה');
  assert.equal(seenAgoLabel(ago(5 * HOUR), NOW), 'לפני 5 שעות');
  assert.equal(seenAgoLabel(ago(50 * HOUR), NOW), 'לפני 2 ימים');
  assert.match(seenAgoLabel(null, NOW), /עוד לא נראתה/);
});

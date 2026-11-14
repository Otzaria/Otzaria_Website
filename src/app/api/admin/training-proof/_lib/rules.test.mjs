/**
 * כללי הסקירה בניהול (rules.js) — טהורים. הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReviewQuery,
  reviewFilter,
  routerAgrees,
  framesChanges,
  adminItem,
  rejectUpdate,
  unapproveUpdate,
  matchPct,
} from './rules.js';
import { ocrItem, routerItem, framesItem } from '../../../../../lib/trainingProof/testFixtures.js';

const sp = (o) => new URLSearchParams(o);

test('parseReviewQuery: ברירות-מחדל וערכים לא מוכרים נזרקים', () => {
  assert.deepEqual(parseReviewQuery(sp({})), {
    section: 'ocr',
    status: 'submitted',
    track: null,
    action: null,
    vol: null,
    lowConf: false,
    page: 1,
    agree: null,
  });
  const q = parseReviewQuery(sp({ section: 'router', status: 'approved', track: 'rashi', action: 'skip', vol: 'x', page: '-3', agree: '1' }));
  assert.equal(q.section, 'router');
  assert.equal(q.status, 'approved');
  assert.equal(q.track, 'rashi');
  assert.equal(q.action, null, '"דלג" אינו מגיע לסקירה');
  assert.equal(q.vol, null);
  assert.equal(q.page, 1);
  assert.equal(q.agree, true);
  assert.equal(parseReviewQuery(sp({ status: 'rejected' })).status, 'submitted');
});

test('reviewFilter: זיהוי — כתב ופעולה; נתב — מה שהמתנדב סימן', () => {
  assert.deepEqual(reviewFilter({ section: 'ocr', status: 'submitted', track: 'rashi', action: 'ok' }), {
    section: 'ocr',
    status: 'submitted',
    track: 'rashi',
    'result.action': 'ok',
  });
  assert.deepEqual(reviewFilter({ section: 'router', status: 'submitted', track: 'mixed' }), {
    section: 'router',
    status: 'submitted',
    'result.label': 'mixed',
  });
});

test('routerAgrees: כתב-שורה זהה להצעה; מעורבת — גם כל מילה; פסול/בלי הצעה — לא', () => {
  const p = routerItem(0); // pred=square, עם מילים
  assert.equal(routerAgrees(p, { label: 'square', bad: false }), true);
  assert.equal(routerAgrees(p, { label: 'rashi', bad: false }), false);
  assert.equal(routerAgrees(p, { label: '', bad: true }), false);
  assert.equal(routerAgrees({ ...p, pred: null }, { label: 'square', bad: false }), false);
  const m = routerItem(2, { words: routerItem(0).words }); // pred=mixed
  const same = m.words.map((w) => ({ k: w.k, box: w.box, label: w.pred }));
  assert.equal(routerAgrees(m, { label: 'mixed', bad: false, words: same }), true);
  const changed = same.map((w, i) => (i === 0 ? { ...w, label: 'rashi' } : w));
  assert.equal(routerAgrees(m, { label: 'mixed', bad: false, words: changed }), false);
  assert.equal(routerAgrees({ ...m, words: undefined }, { label: 'mixed', bad: false, words: same }), false, 'חלוקה של האתר — אין הצעה למילים');
});

test('framesChanges: נוספה, נמחקה, שונה תפקיד, זזה תיבה — כל אחת נספרת', () => {
  const before = framesItem(0).frames;
  assert.equal(framesChanges(before, before), 0);
  const after = before
    .filter((f) => f.fid !== 'f9')
    .map((f) => (f.fid === 'f1' ? { ...f, role: 'heading' } : f.fid === 'f2' ? { ...f, box: [870, 265.5, 1520.8, 2243.5] } : f));
  after.push({ fid: 'n1', kind: 'text', role: 'notes', box: [1, 1, 50, 50], stream: null, ord: 3, cont: false });
  assert.equal(framesChanges(before, after), 4);
  assert.equal(framesChanges(before, before.map((f) => ({ ...f, box: f.box.map((v) => v + 0.2) }))), 0, 'רעד של פחות מחצי פיקסל');
});

test('adminItem: זיהוי — טקסט המודל, ביטחון והקשר; בלי מפתח-הספר', () => {
  const d = {
    _id: 'a'.repeat(24),
    section: 'ocr',
    status: 'submitted',
    payload: ocrItem(1, { ctx: { img: 'img/ctx.jpg', bbox: [1, 2, 3, 4] } }),
    ctxPath: '/uploads/training-proof/x/img/ctx.jpg',
    result: { action: 'fixed', text: 'א ב' },
    vol: 'b'.repeat(24),
    submittedAt: new Date('2026-10-27T10:00:00Z'),
    rejectedFor: ['c'.repeat(24)],
  };
  const x = adminItem(d, new Map([['b'.repeat(24), 'רחל']]));
  assert.equal(x.img, `/api/admin/training-proof/items/${'a'.repeat(24)}/image`);
  assert.equal(x.ctx.img, `/api/admin/training-proof/items/${'a'.repeat(24)}/ctx`);
  assert.equal(x.vol.name, 'רחל');
  assert.equal(x.conf, 81);
  assert.equal(x.rejectedCount, 1);
  assert.equal(x.book, undefined);
  assert.equal(x.submittedAt, '2026-10-27T10:00:00.000Z');
});

test('adminItem: נתב — מילים לפי הסדר והסכמה; גלאי — מספר השינויים', () => {
  const r = adminItem({ _id: 'a'.repeat(24), section: 'router', status: 'submitted', payload: routerItem(0), result: { label: 'square', bad: false } });
  assert.deepEqual(r.words.map((w) => w.k), [0, 1, 2, 3]);
  assert.equal(r.agrees, true);
  assert.equal(r.ctx, null);
  const rc = adminItem({ _id: 'a'.repeat(24), section: 'router', status: 'submitted', ctxPath: '/c', payload: routerItem(0, { ctx: { img: 'img/c.jpg', bbox: [1, 2, 3, 4] } }) });
  assert.deepEqual(rc.ctx, { img: `/api/admin/training-proof/items/${'a'.repeat(24)}/ctx`, bbox: [1, 2, 3, 4] });
  const p = framesItem(0);
  const f = adminItem({ _id: 'a'.repeat(24), section: 'frames', status: 'submitted', payload: p, result: { status: 'marked', frames: p.frames.slice(1) } });
  assert.equal(f.changes, 1);
  assert.equal(f.book, 'b-a7f3310c6e', 'בגלאי הספר הוא מפתח-הקיבוץ (אטום, לא שם)');
});

test('rejectUpdate / unapproveUpdate: לפי הכללים המשותפים', () => {
  const u = rejectUpdate('V');
  assert.equal(u.$set.status, 'available');
  assert.equal(u.$set.result, null);
  assert.equal(u.$set.vol, null);
  assert.deepEqual(u.$addToSet, { notFor: 'V', rejectedFor: 'V' });
  assert.equal(rejectUpdate(null).$addToSet, undefined);
  const back = unapproveUpdate({ adminFixed: true, volResult: { action: 'ok' } });
  assert.deepEqual(back.$set.result, { action: 'ok' });
  assert.equal(back.$set.status, 'submitted');
  assert.equal(unapproveUpdate({ adminFixed: false }).$set.result, undefined);
});

test('matchPct', () => {
  assert.equal(matchPct(0.966), 97);
  assert.equal(matchPct(null), null);
});

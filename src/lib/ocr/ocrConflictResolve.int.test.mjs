/**
 * הכרעה בהתנגשות OCR (סקירה W05) מול MongoDB אמיתי: אימוץ נתפס (open → applying) לפני כתיבת
 * העמוד, דחייה מותנית ב-open, וקריסה במצב הביניים — מוכרעת אחרי ה-lease לפי סימון העמוד.
 * הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Page from '../../models/Page.js';
import OcrConflict from '../../models/OcrConflict.js';
import { pageApplySet } from './localApply.pure.js';
import { CONFLICT_APPLY_LEASE_MS } from './ocrConflictView.js';
import { resolveConflict, settleStaleConflictApplies } from './ocrConflictResolve.js';
import { startMongo } from '../corrections/testing/mongo.js';

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});
beforeEach(async () => {
  if (!db.skip) await db.reset();
});

const oid = () => new mongoose.Types.ObjectId();
const SHA = 'd'.repeat(64);
const HUMAN = 'טקסט אנושי';
const OCR = 'טקסט OCR';

async function fixture() {
  const book = oid();
  const job = oid();
  const page = await Page.create({ book, pageNumber: 3, imagePath: '/x/3.jpg', content: HUMAN });
  const conflict = await OcrConflict.create({
    job, book, page: page._id, pageNumber: 3, ocrText: OCR, resultSha256: SHA,
    expectedUpdatedAt: new Date(page.updatedAt.getTime() - 1000), foundUpdatedAt: page.updatedAt,
  });
  return { book, job, page, conflict };
}

// מצב שקריסה הייתה משאירה: applying שה-lease שלו פג; landed — האם כתיבת העמוד כבר קרתה
async function crashedApplying({ page, conflict }, { landed }) {
  const t0 = new Date(Date.now() - CONFLICT_APPLY_LEASE_MS - 60000);
  await OcrConflict.updateOne({ _id: conflict._id }, {
    $set: {
      status: 'applying', applyToken: 'tok-crashed', applyStartedAt: t0,
      applyLeaseUntil: new Date(t0.getTime() + CONFLICT_APPLY_LEASE_MS), applyByName: 'מנהל א',
      applyExpectedUpdatedAt: page.updatedAt,
    },
  });
  if (landed) {
    await Page.updateOne({ _id: page._id }, { $set: pageApplySet(OCR, conflict.job, SHA, t0) });
  }
  return t0;
}

const contentOf = async (page) => (await Page.findById(page._id).lean()).content;
const conflictOf = (conflict) => OcrConflict.findById(conflict._id).lean();

test('אימוץ שנתקע לפני כתיבת העמוד (בקשה חיה) — דחייה ואימוץ נוסף נדחים ב-apply_in_progress; אחרי השחרור applied', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const f = await fixture();
  let release;
  const barrier = new Promise((r) => { release = r; });
  let held = false;
  const applying = resolveConflict({
    id: f.conflict._id, action: 'apply', expected: f.page.updatedAt, byName: 'מנהל א',
    hooks: { beforePageWrite: async () => { held = true; await barrier; } },
  });
  while (!held) await new Promise((r) => setTimeout(r, 5));

  assert.equal((await conflictOf(f.conflict)).status, 'applying');
  const dismiss = await resolveConflict({ id: f.conflict._id, action: 'dismiss', byName: 'מנהל ב' });
  assert.deepEqual(dismiss, { ok: false, code: 'apply_in_progress' });
  const second = await resolveConflict({ id: f.conflict._id, action: 'apply', expected: f.page.updatedAt, byName: 'מנהל ב' });
  assert.deepEqual(second, { ok: false, code: 'apply_in_progress' });
  assert.equal(await contentOf(f.page), HUMAN);

  release();
  const r = await applying;
  assert.equal(r.ok, true);
  assert.equal(r.conflict.status, 'applied');
  assert.equal(r.conflict.resolvedByName, 'מנהל א');
  assert.equal(r.conflict.applyToken, undefined);
  assert.equal(await contentOf(f.page), OCR);
});

test('אימוץ שנכשל ב-updatedAt (העמוד נערך שוב) — חוזר ל-open, ודחייה אחריו מצליחה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const f = await fixture();
  const stale = new Date(f.page.updatedAt.getTime() - 5000);
  const r = await resolveConflict({ id: f.conflict._id, action: 'apply', expected: stale, byName: 'א' });
  assert.deepEqual(r, { ok: false, code: 'page_changed' });
  const c = await conflictOf(f.conflict);
  assert.equal(c.status, 'open');
  assert.equal(c.applyToken, undefined);
  assert.equal(await contentOf(f.page), HUMAN);
  const d = await resolveConflict({ id: f.conflict._id, action: 'dismiss', byName: 'ב' });
  assert.equal(d.ok, true);
  assert.equal(d.conflict.status, 'dismissed');
});

test('עמוד שנמחק — page_missing וההתנגשות חוזרת ל-open', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const f = await fixture();
  await Page.deleteOne({ _id: f.page._id });
  const r = await resolveConflict({ id: f.conflict._id, action: 'apply', expected: f.page.updatedAt });
  assert.deepEqual(r, { ok: false, code: 'page_missing' });
  assert.equal((await conflictOf(f.conflict)).status, 'open');
});

test('קריסה אחרי התפיסה ולפני כתיבת העמוד — אחרי ה-lease חוזר ל-open, ודחייה מצליחה בלי שינוי בעמוד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const f = await fixture();
  // הבקשה "קורסת" בדיוק לפני כתיבת העמוד
  await assert.rejects(resolveConflict({
    id: f.conflict._id, action: 'apply', expected: f.page.updatedAt, byName: 'א',
    hooks: { beforePageWrite: () => { throw new Error('crash'); } },
  }), /crash/);
  assert.equal((await conflictOf(f.conflict)).status, 'applying');
  // בתוך ה-lease — עדיין "בתהליך"
  assert.deepEqual(await resolveConflict({ id: f.conflict._id, action: 'dismiss' }), { ok: false, code: 'apply_in_progress' });

  const later = new Date(Date.now() + CONFLICT_APPLY_LEASE_MS + 1000);
  const d = await resolveConflict({ id: f.conflict._id, action: 'dismiss', byName: 'ב', now: later });
  assert.equal(d.ok, true);
  assert.equal(d.conflict.status, 'dismissed');
  assert.equal(d.conflict.resolvedByName, 'ב');
  assert.equal(await contentOf(f.page), HUMAN);
});

test('קריסה אחרי כתיבת העמוד ולפני applied — הפעולה הבאה מזהה את הסימון ומשלימה ל-applied (דחייה → already_resolved)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const f = await fixture();
  const t0 = await crashedApplying(f, { landed: true });
  const d = await resolveConflict({ id: f.conflict._id, action: 'dismiss', byName: 'ב' });
  assert.deepEqual(d, { ok: false, code: 'already_resolved' });
  const c = await conflictOf(f.conflict);
  assert.equal(c.status, 'applied');
  assert.equal(c.resolvedByName, 'מנהל א');
  assert.equal(c.resolvedAt.getTime(), t0.getTime());
  assert.equal(c.applyToken, undefined);
  assert.equal(await contentOf(f.page), OCR);
});

test('קריסה במצב הביניים — טעינת הרשימה (settleStaleConflictApplies) מכריעה לפי העמוד ולא נוגעת ב-lease חי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const landedF = await fixture();
  await crashedApplying(landedF, { landed: true });
  const notLandedF = await fixture();
  await crashedApplying(notLandedF, { landed: false });
  // אימוץ חי (lease בתוקף) — לא נוגעים
  const liveF = await fixture();
  await OcrConflict.updateOne({ _id: liveF.conflict._id }, {
    $set: { status: 'applying', applyToken: 'live', applyStartedAt: new Date(), applyLeaseUntil: new Date(Date.now() + 60000) },
  });

  const n = await settleStaleConflictApplies({ job: { $in: [landedF.job, notLandedF.job, liveF.job] } });
  assert.equal(n, 2);
  assert.equal((await conflictOf(landedF.conflict)).status, 'applied');
  assert.equal((await conflictOf(notLandedF.conflict)).status, 'open');
  assert.equal(await contentOf(notLandedF.page), HUMAN);
  assert.equal((await conflictOf(liveF.conflict)).status, 'applying');
});

test('קריסה לפני כתיבת העמוד — ההכרעה חוסמת את העמוד (updatedAt+1ms), ואימוץ חוזר אחרי רענון תופס מחדש ומחיל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const f = await fixture();
  await crashedApplying(f, { landed: false });
  // אותו updatedAt שנתפס — כבר לא תקף (החסימה), כדי שגם הכתיבה המקורית לא תנחת
  const stale = await resolveConflict({ id: f.conflict._id, action: 'apply', expected: f.page.updatedAt, byName: 'ב' });
  assert.deepEqual(stale, { ok: false, code: 'page_changed' });
  const fenced = await Page.findById(f.page._id).lean();
  assert.equal(fenced.updatedAt.getTime(), f.page.updatedAt.getTime() + 1);
  assert.equal(fenced.content, HUMAN);
  assert.equal((await conflictOf(f.conflict)).status, 'open');

  const r = await resolveConflict({ id: f.conflict._id, action: 'apply', expected: fenced.updatedAt, byName: 'ב' });
  assert.equal(r.ok, true);
  assert.equal(r.conflict.status, 'applied');
  assert.equal(r.conflict.resolvedByName, 'ב');
  assert.equal(await contentOf(f.page), OCR);
});

test('בקשת אימוץ שהתעכבה מעבר ל-lease: הוחזרה ל-open ונדחתה, ואז הכתיבה המאוחרת מגיעה — לא נוחתת, העמוד לא מוחלף', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const f = await fixture();
  const old = new Date(Date.now() - CONFLICT_APPLY_LEASE_MS - 60000);
  const r = await resolveConflict({
    id: f.conflict._id, action: 'apply', expected: f.page.updatedAt, byName: 'א', now: old,
    hooks: {
      beforePageWrite: async () => {
        // בזמן ההמתנה: ה-lease פג, הרשימה הכריעה "לא נכתב" → open, ומנהל אחר בחר "שמור את הקיים"
        await settleStaleConflictApplies({ job: f.job });
        assert.equal((await conflictOf(f.conflict)).status, 'open');
        const d = await resolveConflict({ id: f.conflict._id, action: 'dismiss', byName: 'ב' });
        assert.equal(d.ok, true);
      },
    },
  });
  assert.deepEqual(r, { ok: false, code: 'page_changed' });
  assert.equal(await contentOf(f.page), HUMAN);
  const c = await conflictOf(f.conflict);
  assert.equal(c.status, 'dismissed');
  assert.equal(c.resolvedByName, 'ב');
});

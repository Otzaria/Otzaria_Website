/**
 * בדיקות אינטגרציה למסלול המהיר (items.js) מול MongoDB אמיתי: דגימה (גמרא קודם, kind, מושהה, החזקה רכה),
 * תשובה אטומית, הסכמה ונקודות פעם אחת, מחלוקת, תרגול והכרעת מנהל. הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import TzuratItem from '../../models/TzuratItem.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratBatch from '../../models/TzuratBatch.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { sampleFastItem, answerChoice as answerChoiceRaw, addAnswer, settle, flagItem, fastStats, gradePractice, adminItemAction, practiceItems, fastItemFor } from './items.js';
import { optionsFor } from './questions.js';

async function answerChoice(id, user, body, opts) {
  const item = await TzuratItem.findById(id).lean();
  return answerChoiceRaw(id, user, { revision: item?.revision ?? 0, ...body }, opts);
}

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});

let u1, u2, u3, page;
const user = (u) => ({ id: String(u._id), name: u.name });
const box = { x: 0.4, y: 0.2, w: 0.06, h: 0.016 };

function mkItem(key, extra = {}) {
  return TzuratItem.create({
    sourceKey: `berakhot|g|r|${key}|rep`,
    slug: 'berakhot',
    masechet: 'ברכות',
    daf: 'ב.',
    dafKey: '002a',
    page: page._id,
    kind: 'g',
    question: 'replace',
    otz: ['אמר'],
    print: ['א"ר'],
    n: 1,
    box,
    score: 1,
    ...extra,
  });
}

beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  [u1, u2, u3] = await User.create([
    { name: 'א', email: 'a@x.test', isVerified: true },
    { name: 'ב', email: 'b@x.test', isVerified: true },
    { name: 'ג', email: 'c@x.test', isVerified: true },
  ]);
  await TzuratBatch.create({ slug: 'berakhot', masechet: 'ברכות', status: 'active' });
  await TzuratBatch.create({ slug: 'shabbat', masechet: 'שבת', status: 'paused' });
  page = await TzuratPage.create({ slug: 'berakhot', dafKey: '002a', daf: 'ב.', scan: { path: '/uploads/tzurat-hadaf/berakhot/002a.scan.png', w: 2600, h: 3500 }, buildId: 'b1' });
});

const points = async (u) => (await User.findById(u._id, { points: 1 }).lean()).points;
const choiceFor = (item, u, word) => optionsFor(item, String(u._id)).find((o) => o.words[0] === word).id;

test('דגימה: גמרא קודם, kind, מושהה, בלי תיבה, תרגול ומה שכבר נענה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rashi = await mkItem('1', { kind: 'r', score: 99 });
  const g = await mkItem('2', { score: 1 });
  await mkItem('3', { box: null, score: 50 });
  await mkItem('4', { slug: 'shabbat', score: 60 });
  await mkItem('5', { practice: true, score: 70 });
  const a = await sampleFastItem(String(u1._id));
  assert.equal(String(a._id), String(g._id));
  // kind=r — רק רש"י (לכל מתנדב)
  assert.equal(String((await sampleFastItem(String(u2._id), { kind: 'r' }))._id), String(rashi._id));
  // exclude, ואחרי תשובה — לא שוב
  const b = await sampleFastItem(String(u1._id), { exclude: [g._id] });
  assert.equal(String(b._id), String(rashi._id));
  await answerChoice(g._id, user(u1), { choice: 'unclear' });
  await answerChoice(rashi._id, user(u1), { choice: 'unclear' });
  const c = await sampleFastItem(String(u1._id));
  assert.equal(c, null);
});

test('החזקה רכה: פריט מוחזק אצל אחר מוצע רק כשאין אחר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const i1 = await mkItem('1', { score: 5 });
  const i2 = await mkItem('2', { score: 1 });
  const first = await sampleFastItem(String(u1._id));
  assert.ok([String(i1._id), String(i2._id)].includes(String(first._id)));
  const second = await sampleFastItem(String(u2._id));
  assert.notEqual(String(second._id), String(first._id));
  // u3 — שניהם מוחזקים: מקבל אחד מהם בלי לגעת בהחזקה
  const third = await sampleFastItem(String(u3._id));
  assert.ok(third);
  const held = await TzuratItem.findById(third._id).lean();
  assert.notEqual(String(held.leasedBy), String(u3._id));
});

test('הסכמה: שתי תשובות זהות ← agreed, +1 לכל אחד, פעם אחת; 409 אחרי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const it = await mkItem('1');
  const r1 = await answerChoice(it._id, user(u1), { choice: choiceFor(it, u1, 'א"ר') });
  assert.deepEqual(r1, { ok: true, status: 'recorded', points: 0 });
  const dup = await answerChoice(it._id, user(u1), { choice: 'unclear' });
  assert.equal(dup.status, 409);
  assert.equal(dup.code, 'answered');
  const r2 = await answerChoice(it._id, user(u2), { choice: choiceFor(it, u2, 'א"ר'), via: 'page' });
  assert.deepEqual(r2, { ok: true, status: 'agreed', points: 1 });
  const doc = await TzuratItem.findById(it._id).lean();
  assert.equal(doc.status, 'agreed');
  assert.equal(doc.decision.verdict, 'print');
  assert.equal(doc.answers[1].via, 'page');
  assert.equal(await points(u1), 1);
  assert.equal(await points(u2), 1);
  const closed = await answerChoice(it._id, user(u3), { choice: 'unclear' });
  assert.equal(closed.code, 'closed');
  // settle שוב (מקבילות) — בלי נקודות נוספות
  await settle(it._id, { ...doc, status: 'open' });
  assert.equal(await points(u1), 1);
  const stats = await fastStats(String(u1._id));
  assert.equal(stats.mine, 1);
  assert.equal(stats.mineAgreed, 1);
});

test('מחלוקת ו-unclear', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await mkItem('1');
  await answerChoice(a._id, user(u1), { choice: choiceFor(a, u1, 'אמר') });
  const r = await answerChoice(a._id, user(u2), { choice: choiceFor(a, u2, 'א"ר') });
  assert.equal(r.status, 'disputed');
  assert.equal(await points(u1), 0);
  const b = await mkItem('2');
  assert.equal((await answerChoice(b._id, user(u1), { choice: 'unclear' })).status, 'recorded');
  assert.equal((await answerChoice(b._id, user(u2), { choice: 'unclear' })).status, 'disputed');
  const c = await mkItem('3');
  await answerChoice(c._id, user(u1), { choice: 'other', text: 'אמר רב' });
  const rc = await answerChoice(c._id, user(u2), { choice: 'other', text: 'אָמַר רַב' });
  assert.equal(rc.status, 'agreed');
});

test('תוספות — לכל מתנדב; flag', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const r = await mkItem('1', { kind: 't' });
  assert.equal((await addAnswer(r._id, user(u1), { verdict: 'print' })).ok, true);
  // סימון רך: אחד — נרשם, השאלה לא מוצעת לו שוב; שני משתמשים — flagged
  const g = await mkItem('2');
  assert.deepEqual(await flagItem(g._id, String(u1._id), 'crop'), { ok: true, flagged: false });
  assert.equal((await TzuratItem.findById(g._id).lean()).status, 'open');
  assert.equal((await flagItem(g._id, String(u1._id), 'crop')).code, 'flagged');
  assert.equal(await sampleFastItem(String(u1._id)), null);
  assert.equal(String((await sampleFastItem(String(u2._id)))._id), String(g._id));
  assert.deepEqual(await flagItem(g._id, String(u2._id), 'crop'), { ok: true, flagged: true });
  assert.equal((await TzuratItem.findById(g._id).lean()).status, 'flagged');
  assert.equal((await flagItem(g._id, String(u3._id), 'crop')).code, 'closed');
  // מסכת מושהית — לא מסמנים ולא עונים
  const paused = await mkItem('3', { slug: 'shabbat' });
  assert.equal((await flagItem(paused._id, String(u1._id), 'crop')).code, 'paused');
  assert.equal((await answerChoice(paused._id, user(u1), { choice: 'unclear' })).code, 'paused');
});

test('other: הטקסט נשמר כפי שנכתב (גרשיים), ההשוואה מנורמלת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const it = await mkItem('1');
  await answerChoice(it._id, user(u1), { choice: 'other', text: ' א״ר  יוחנן ' });
  const r = await answerChoice(it._id, user(u2), { choice: 'other', text: 'א"ר יוחנן' });
  assert.equal(r.status, 'agreed');
  const doc = await TzuratItem.findById(it._id).lean();
  assert.equal(doc.answers[0].text, 'א״ר יוחנן');
  assert.equal(doc.answers[1].text, 'א"ר יוחנן');
  assert.equal(doc.decision.text, 'א״ר יוחנן');
});

test('settle: נסגר גם כשהנקודות כבר חולקו — בלי לזכות שוב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const it = await mkItem('1', { pointsAwarded: true });
  await answerChoice(it._id, user(u1), { choice: 'unclear' });
  await TzuratItem.updateOne({ _id: it._id }, { $set: { answers: [] } });
  await answerChoice(it._id, user(u1), { choice: choiceFor(it, u1, 'אמר') });
  const r = await answerChoice(it._id, user(u2), { choice: choiceFor(it, u2, 'אמר') });
  assert.deepEqual(r, { ok: true, status: 'agreed', points: 0 });
  assert.equal((await TzuratItem.findById(it._id).lean()).status, 'agreed');
  assert.equal(await points(u1), 0);
});

test('תרגול: ציון ו-practiceDone', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = await mkItem('p1', { practice: true, sourceKey: 'practice:x', expected: 'print', explain: 'כך נדפס' });
  const items = await practiceItems(String(u1._id));
  assert.equal(items.length, 1);
  assert.equal(items[0].explain, 'כך נדפס');
  const right = choiceFor(p, u1, 'א"ר');
  const g = await gradePractice(String(u1._id), [{ id: String(p._id), choice: right }]);
  assert.deepEqual(g, { ok: true, score: 1, total: 1, results: [{ id: String(p._id), correct: true, expected: right, explain: 'כך נדפס' }] });
  assert.equal((await User.findById(u1._id).lean()).tzuratPracticeDone, true);
  // פריט תרגול אינו בתור ואינו נענה כרגיל
  assert.equal(await sampleFastItem(String(u2._id)), null);
  assert.equal((await answerChoice(p._id, user(u2), { choice: 'unclear' })).status, 404);
  const f = await fastItemFor(p, String(u1._id));
  assert.equal(f.id, String(p._id));
  // שתי שאלות תרגול — תשובה לאחת בלבד אינה מספיקה, ואינה מסמנת
  await mkItem('p2', { practice: true, sourceKey: 'practice:y', expected: 'otz' });
  const short = await gradePractice(String(u2._id), [{ id: String(p._id), choice: 'unclear' }]);
  assert.equal(short.code, 'practice_short');
  assert.equal((await User.findById(u2._id).lean()).tzuratPracticeDone, false);
});

test('הכרעת מנהל: נקודות למי שענה כמוה, פעם אחת; reopen מנקה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await mkItem('1');
  await answerChoice(a._id, user(u1), { choice: choiceFor(a, u1, 'אמר') });
  await answerChoice(a._id, user(u2), { choice: choiceFor(a, u2, 'א"ר') });
  const admin = { id: String(u3._id), name: 'מנהל' };
  const r = await adminItemAction(a._id, { action: 'resolve', verdict: 'otz' }, admin);
  assert.equal(r.item.status, 'resolved');
  assert.equal(await points(u1), 1);
  assert.equal(await points(u2), 0);
  await adminItemAction(a._id, { action: 'resolve', verdict: 'otz' }, admin);
  assert.equal(await points(u1), 1);
  const ro = await adminItemAction(a._id, { action: 'reopen' }, admin);
  assert.equal(ro.item.status, 'open');
  assert.equal(ro.item.answers.length, 0);
  assert.equal((await adminItemAction(a._id, { action: 'bogus' }, admin)).status, 400);
  assert.equal((await adminItemAction(new mongoose.Types.ObjectId(), { action: 'reopen' }, admin)).status, 404);
});

test('a stale or missing revision cannot reinterpret a displayed choice, including concurrent imports', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const it = await TzuratItem.create({ sourceKey: 'berakhot|g|R|900|rep', slug: 'berakhot', dafKey: '002a', otz: ['א'], print: ['ב'] });
  const shown = await fastItemFor(it.toObject(), String(u1._id));
  assert.equal((await answerChoiceRaw(it._id, user(u1), { choice: 'a' })).code, 'stale');
  await TzuratItem.updateOne({ _id: it._id }, { $set: { print: ['ה'] }, $inc: { revision: 1 } });
  assert.equal((await answerChoiceRaw(it._id, user(u1), { choice: 'a', revision: shown.revision })).code, 'stale');
  const update = TzuratItem.findOneAndUpdate;
  let imported = false;
  t.mock.method(TzuratItem, 'findOneAndUpdate', async function (...args) {
    if (args[1]?.$push?.answers && !imported) {
      imported = true;
      await TzuratItem.updateOne({ _id: it._id }, { $set: { print: ['ו'] }, $inc: { revision: 1 } });
    }
    return update.apply(this, args);
  });
  assert.equal((await answerChoiceRaw(it._id, user(u1), { choice: 'a', revision: shown.revision + 1 })).code, 'stale');
  assert.equal((await TzuratItem.findById(it._id).lean()).answers.length, 0);
});

test('the fast queue uses an index for the complete ordering instead of sorting all candidates', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await TzuratItem.insertMany(Array.from({ length: 2000 }, (_, i) => ({ sourceKey: `perf|${i}`, slug: 'berakhot', dafKey: '002a', kind: 'g', score: i, box: { x: 0, y: 0, w: 0.1, h: 0.1 } })));
  const plan = await TzuratItem.find({ status: 'open', kind: 'g', practice: { $ne: true }, box: { $ne: null }, 'answers.user': { $ne: u1._id }, 'flags.user': { $ne: u1._id }, $or: [{ leasedUntil: null }, { leasedUntil: { $lt: new Date() } }, { leasedBy: u1._id }] }, { _id: 1 }).sort({ score: -1, _id: 1 }).limit(20).explain('executionStats');
  assert.equal(plan.executionStats.nReturned, 20);
  assert.ok(plan.executionStats.totalDocsExamined <= 40, JSON.stringify(plan.executionStats));
  assert.equal(JSON.stringify(plan.queryPlanner.winningPlan).includes('"stage":"SORT"'), false);
});

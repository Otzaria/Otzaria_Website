/**
 * בדיקות אינטגרציה לבדיקת עמוד (pages.js, submissions.js) ולייצוא (exportStream.js) מול MongoDB אמיתי:
 * תפיסה (תקרה, חידוש בידי המחזיק), טיוטה (stale/not_holder), הגשה עם עוגנים, תשובות, תיקון ידני ודיווח,
 * אישור (+10 פעם אחת, done) ודחייה (העמוד חוזר), עמוד כפול, סנכרון דיווח (+2), ושורות הייצוא.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../models/User.js';
import TzuratItem from '../../models/TzuratItem.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratBatch from '../../models/TzuratBatch.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import TzuratReport from '../../models/TzuratReport.js';
import TzuratDraft from '../../models/TzuratDraft.js';
import TzuratExportJob from '../../models/TzuratExportJob.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { claimPage, releasePage, saveDraft as saveDraftRaw, pageDetail, bookPages, MAX_HELD } from './pages.js';
import { submitPage as submitPageRaw, approveSubmission, rejectSubmission } from './submissions.js';
import { applySync } from './reports.js';
import { exportRowsStream } from './exportStream.js';
import { acknowledgeExport } from './exportAck.js';
import { reviewVersion } from './shapes.js';
import { answerChoice as answerChoiceRaw } from './items.js';
import { optionsFor } from './questions.js';
import { overview, mine } from './volunteer.js';

async function saveDraft(id, uid, body) {
  const p = await TzuratPage.findById(id).lean();
  return saveDraftRaw(id, uid, { version: reviewVersion(p), ...body });
}
async function submitPage(id, user, body, opts) {
  const p = await TzuratPage.findById(id).lean();
  const itemAnswers = await Promise.all((body.itemAnswers || []).map(async (a) => ({ revision: (await TzuratItem.findById(a.item).lean())?.revision ?? 0, ...a })));
  return submitPageRaw(id, user, { version: reviewVersion(p), ...body, itemAnswers }, opts);
}
async function answerChoice(id, user, body) {
  const it = await TzuratItem.findById(id).lean();
  return answerChoiceRaw(id, user, { revision: it?.revision ?? 0, ...body });
}

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});

const words = (ref, from, list) => list.map((t, k) => ({ t, ref, wi: from + k }));
const model = {
  blocks: [
    {
      id: 'g',
      kind: 'g',
      label: 'גמרא',
      lines: [
        { i: 0, ours: [0, 0, 1, 0.01], scan: null, words: words('R', 0, ['מאימתי', 'קורין', 'את']) },
        { i: 1, ours: [0, 0.02, 1, 0.01], scan: null, words: words('R', 3, ['שמע', 'בערבין', 'משעה']) },
      ],
    },
  ],
};

let u1, u2, admin, pages;
const user = (u) => ({ id: String(u._id), name: u.name });
const adminUser = () => ({ id: String(admin._id), name: 'מנהל' });

beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  [u1, u2, admin] = await User.create([
    { name: 'א', email: 'a@x.test', isVerified: true },
    { name: 'ב', email: 'b@x.test', isVerified: true },
    { name: 'מ', email: 'm@x.test', role: 'admin_books' },
  ]);
  await TzuratBatch.create({ slug: 'berakhot', masechet: 'ברכות' });
  pages = [];
  for (let k = 0; k < 8; k++) {
    pages.push(
      await TzuratPage.create({
        slug: 'berakhot',
        masechet: 'ברכות',
        dafKey: `00${2 + Math.floor(k / 2)}${k % 2 ? 'b' : 'a'}`,
        daf: `${k}`,
        order: k,
        buildId: 'b1',
        required: 1,
        scan: { path: '/uploads/tzurat-hadaf/berakhot/x.scan.png', w: 1000, h: 1000 },
        model,
      })
    );
  }
});

test('תפיסה: תקרה, חידוש בידי המחזיק בלי לספור, שחרור, מצבים ברשת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(u1._id);
  for (let k = 0; k < MAX_HELD; k++) assert.ok((await claimPage(pages[k]._id, uid)).ok);
  const over = await claimPage(pages[MAX_HELD]._id, uid);
  assert.equal(over.code, 'too_many');
  // המחזיק תופס שוב — חידוש, לא נספר מול התקרה
  const again = await claimPage(pages[0]._id, uid);
  assert.ok(again.ok);
  assert.ok(new Date(again.leasedUntil) > new Date());
  const other = await claimPage(pages[0]._id, String(u2._id));
  assert.equal(other.code, 'taken');
  const grid = await bookPages('berakhot', uid);
  assert.equal(grid.held.length, MAX_HELD);
  assert.equal(grid.pages[0].state, 'mine');
  assert.equal((await bookPages('berakhot', String(u2._id))).pages[0].state, 'taken');
  await releasePage(pages[0]._id, uid);
  assert.ok((await claimPage(pages[0]._id, String(u2._id))).ok);
  // מסכת מושהית — לא תופסים חדש
  await TzuratBatch.updateOne({ slug: 'berakhot' }, { $set: { status: 'paused' } });
  assert.equal((await claimPage(pages[7]._id, String(u2._id))).code, 'paused');
});

test('טיוטה: רק המחזיק, ומקביליות אופטימית', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(u1._id);
  const p = pages[0]._id;
  assert.equal((await saveDraft(p, uid, { stage: 'lines', state: {} })).code, 'not_holder');
  await claimPage(p, uid);
  const s1 = await saveDraft(p, uid, { stage: 'lines', state: { a: 1 } });
  assert.ok(s1.ok);
  assert.equal((await saveDraft(p, uid, { stage: 'lines', state: { a: 2 } })).code, 'stale');
  const s2 = await saveDraft(p, uid, { stage: 'text', state: { a: 2 }, baseUpdatedAt: s1.updatedAt });
  assert.ok(s2.ok);
  assert.equal((await saveDraft(p, uid, { stage: 'bogus', state: {} })).status, 400);
  const d = await pageDetail(p, uid);
  assert.equal(d.draft.stage, 'text');
  assert.deepEqual(d.draft.state, { a: 2 });
  assert.equal(d.page.state, 'mine');
  assert.equal(d.next.daf, '1');
  assert.equal(d.prev, null);
});

test('הגשה, אישור ודחייה; ייצוא', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(u1._id);
  const page = pages[0];
  const item = await TzuratItem.create({
    sourceKey: 'berakhot|g|R|1|rep', slug: 'berakhot', dafKey: page.dafKey, page: page._id, kind: 'g', question: 'replace',
    otz: ['קורין'], print: ['קורים'], n: 1, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.02 },
  });
  await claimPage(page._id, uid);
  await saveDraft(page._id, uid, { stage: 'submit', state: {} });
  const choice = optionsFor(item, uid).find((o) => o.words[0] === 'קורים').id;
  const body = {
    checks: { blocks: 'ok', size: 'issue' },
    lineOps: [{ op: 'start', block: 'g', line: 1, ref: 'R', wi: 2 }, { op: 'confirm', block: 'g', line: 0 }],
    itemAnswers: [{ item: String(item._id), choice }],
    manualItems: [{ block: 'g', line: 1, ref: 'R', wi: 4, n: 1, otz: ['בערבין'], text: 'בערבית', box: null }],
    reports: [{ category: 'header', text: 'הכותרת שגויה', regions: [] }],
    note: 'הערה',
  };
  assert.equal((await submitPage(page._id, user(u1), { ...body, lineOps: 'x' })).status, 400);
  const r = await submitPage(page._id, user(u1), body);
  assert.ok(r.ok, r.error);
  const sub = await TzuratSubmission.findById(r.submission).lean();
  assert.deepEqual(sub.anchors, [
    { block: 'g', line: 0, action: 'confirm' },
    { block: 'g', line: 1, ref: 'R', wi: 2, action: 'start' },
  ]);
  assert.equal(sub.itemAnswers.length, 1);
  assert.equal(sub.itemAnswers[0].verdict, 'print');
  assert.equal(sub.manualItems.length, 1);
  assert.equal(sub.reports.length, 1);
  const manual = await TzuratItem.findById(sub.manualItems[0]).lean();
  assert.equal(manual.sourceKey, 'berakhot|g|R|4|rep');
  assert.equal(manual.manual, true);
  assert.deepEqual(manual.print, ['בערבית']);
  assert.deepEqual(manual.ctxBefore, ['קורין', 'את', 'שמע']);
  assert.equal(manual.answers[0].verdict, 'print');
  assert.equal(await TzuratDraft.countDocuments({}), 0);
  // שוב — כבר הוגש; מתנדב אחר — אין מקום
  assert.equal((await submitPage(page._id, user(u1), body)).code, 'submitted');
  assert.equal((await submitPage(page._id, user(u2), body)).code, 'taken');
  assert.equal((await bookPages('berakhot', uid)).pages[0].state, 'submitted');

  // אישור: +10 פעם אחת, העמוד done
  const ap = await approveSubmission(r.submission, adminUser(), { note: 'יפה' });
  assert.equal(ap.submission.status, 'approved');
  assert.equal((await User.findById(u1._id).lean()).points, 10);
  assert.equal((await approveSubmission(r.submission, adminUser())).status, 409);
  assert.equal((await User.findById(u1._id).lean()).points, 10);
  assert.equal((await TzuratPage.findById(page._id).lean()).status, 'done');
  assert.equal((await bookPages('berakhot', uid)).pages[0].state, 'approved');

  // הסכמה על הפריט הידני, דיווח שתוקן (+2)
  const mItem = await TzuratItem.findById(sub.manualItems[0]).lean();
  const ch = optionsFor(mItem, String(u2._id)).find((o) => o.words[0] === 'בערבית').id;
  assert.equal((await answerChoice(mItem._id, user(u2), { choice: ch })).status, 'agreed');
  const sync = await applySync({ reports: [{ id: String(sub.reports[0]), status: 'fixed', buildId: 'b2' }], pages: [{ slug: 'berakhot', dafKey: pages[5].dafKey, action: 'close' }] });
  assert.deepEqual([sync.reports, sync.pages], [1, 1]);
  await applySync({ reports: [{ id: String(sub.reports[0]), status: 'fixed' }] });
  assert.equal((await User.findById(u1._id).lean()).points, 10 + 1 + 2);

  // ייצוא
  const rows = [];
  for await (const row of exportRowsStream({ types: ['decision', 'anchor', 'check', 'report', 'contributor'] })) rows.push(row);
  const byType = (ty) => rows.filter((x) => x.type === ty);
  assert.equal(rows[0].type, 'meta');
  assert.equal(byType('decision').length, 1);
  assert.equal(byType('decision')[0].manual, true);
  assert.equal(byType('anchor').length, 2);
  assert.equal(byType('check').length, 2);
  assert.equal(byType('report').length, 1);
  const c1 = byType('contributor').find((c) => c.who === `otz-${uid}`);
  assert.deepEqual([c1.decisions, c1.pages, c1.reports, c1.name], [2, 1, 1, 'א']);
  assert.ok((await TzuratSubmission.findById(r.submission).lean()).exportedAt);
  // since — רק מה שהשתנה
  const later = [];
  for await (const row of exportRowsStream({ types: ['decision', 'report'], since: new Date(Date.now() + 1000) })) later.push(row);
  assert.equal(later.length, 1);

  // אחרי ייצוא — אי אפשר לדחות הגשה מאושרת
  assert.equal((await rejectSubmission(r.submission, adminUser())).status, 409);

  const ov = await overview(uid);
  assert.equal(ov.me.pagesApproved, 1);
  assert.equal(ov.books[0].pagesDone, 1);
  const m = await mine(uid);
  assert.equal(m.pages[0].status, 'approved');
  assert.equal(m.reports[0].status, 'fixed');
});

test('דחייה: העמוד חוזר למאגר (גם למגיש); עמוד כפול', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = pages[1];
  const r = await submitPage(p._id, user(u1), { checks: {}, lineOps: [] });
  assert.ok(r.ok);
  const rej = await rejectSubmission(r.submission, adminUser(), { note: 'לא' });
  assert.equal(rej.submission.status, 'rejected');
  const page = await TzuratPage.findById(p._id).lean();
  assert.deepEqual([page.activeCount, page.submitters.length, page.status], [0, 0, 'open']);
  assert.ok((await claimPage(p._id, String(u1._id))).ok);

  // עמוד כפול: שני מגישים, done רק אחרי שני אישורים
  const d = pages[2];
  await TzuratPage.updateOne({ _id: d._id }, { $set: { required: 2 } });
  const s1 = await submitPage(d._id, user(u1), { lineOps: [] });
  assert.equal((await bookPages('berakhot', String(u2._id))).pages[2].state, 'open');
  const s2 = await submitPage(d._id, user(u2), { lineOps: [] });
  assert.ok(s1.ok && s2.ok);
  await approveSubmission(s1.submission, adminUser());
  assert.equal((await TzuratPage.findById(d._id).lean()).status, 'open');
  await approveSubmission(s2.submission, adminUser());
  assert.equal((await TzuratPage.findById(d._id).lean()).status, 'done');
  // דחיית מאושרת שעוד לא יצאה — הנקודות יורדות והעמוד נפתח
  await rejectSubmission(s2.submission, adminUser());
  assert.equal((await TzuratPage.findById(d._id).lean()).status, 'open');
  assert.equal((await User.findById(u2._id).lean()).points, 0);
  assert.equal(await TzuratReport.countDocuments({}), 0);
});

test('תפיסות במקביל — לא יותר מ-MAX_HELD', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(u1._id);
  const rs = await Promise.all(pages.slice(0, MAX_HELD + 2).map((p) => claimPage(p._id, uid)));
  assert.ok(rs.filter((r) => r.ok).length <= MAX_HELD);
  assert.ok((await TzuratPage.countDocuments({ leasedBy: u1._id })) <= MAX_HELD);
});

test('אישור עם שורות מתוקנות אחרי סבב חדש — 409 stale', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = pages[3];
  const s = await submitPage(p._id, user(u1), { lineOps: [] });
  await TzuratPage.updateOne({ _id: p._id }, { $inc: { round: 1 } });
  const r = await approveSubmission(s.submission, adminUser(), { lineOps: [{ op: 'confirm', block: 'g', line: 0 }] });
  assert.equal(r.code, 'stale');
  assert.ok((await approveSubmission(s.submission, adminUser())).ok);
});

test('דחייה מבטלת את תשובות העמוד: פתוח — יוצאת, הוסכם — חוזר ונקודות מוחזרות, ידני — obsolete', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = pages[4];
  const mk = (k) =>
    TzuratItem.create({ sourceKey: `berakhot|g|R|${k}|rep`, slug: 'berakhot', dafKey: p.dafKey, page: p._id, kind: 'g', question: 'replace', otz: ['א'], print: ['ב'], n: 1 });
  const open1 = await mk(10);
  const agreed = await mk(11);
  const pick = (it, u) => optionsFor(it, String(u._id)).find((o) => o.words[0] === 'ב').id;
  await answerChoice(agreed._id, user(u2), { choice: pick(agreed, u2) });
  const s = await submitPage(p._id, user(u1), {
    lineOps: [],
    itemAnswers: [
      { item: String(open1._id), choice: pick(open1, u1) },
      { item: String(agreed._id), choice: pick(agreed, u1) },
    ],
    manualItems: [{ block: 'g', line: 0, ref: 'R', wi: 1, otz: ['קורין'], text: 'קורים' }],
  });
  assert.equal((await TzuratItem.findById(agreed._id).lean()).status, 'agreed');
  assert.equal((await User.findById(u1._id).lean()).points, 1);
  await rejectSubmission(s.submission, adminUser());
  const o = await TzuratItem.findById(open1._id).lean();
  assert.deepEqual([o.status, o.answers.length], ['open', 0]);
  const a = await TzuratItem.findById(agreed._id).lean();
  assert.deepEqual([a.status, a.answers.length, a.pointsAwarded], ['open', 1, false]);
  assert.equal((await User.findById(u1._id).lean()).points, 0);
  assert.equal((await User.findById(u2._id).lean()).points, 0);
  const sub = await TzuratSubmission.findById(s.submission).lean();
  assert.equal((await TzuratItem.findById(sub.manualItems[0]).lean()).status, 'obsolete');
});

test('סנכרון reopen: idempotent, ולא מייתם הגשה ממתינה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = pages[6];
  const s = await submitPage(p._id, user(u1), { lineOps: [] });
  const req = { pages: [{ slug: 'berakhot', dafKey: p.dafKey, action: 'reopen', note: 'תוקן', buildId: 'b2' }] };
  const r1 = await applySync(req);
  assert.equal(r1.pages, 0);
  assert.match(r1.errors[0], /ממתינה/);
  await approveSubmission(s.submission, adminUser());
  assert.equal((await applySync(req)).pages, 1);
  assert.equal((await applySync(req)).pages, 1);
  const page = await TzuratPage.findById(p._id).lean();
  assert.deepEqual([page.round, page.status, page.leasedBy], [2, 'open', null]);
});

test('ייצוא since: ביטול הכרעה שיצאה ונפתחה מחדש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const it = await TzuratItem.create({
    sourceKey: 'berakhot|g|R|20|rep', slug: 'berakhot', dafKey: pages[0].dafKey, page: pages[0]._id, kind: 'g', otz: ['א'], print: ['ב'], n: 1,
    status: 'agreed', decision: { verdict: 'print', text: null, at: new Date() },
  });
  const all = [];
  for await (const row of exportRowsStream({ types: ['decision'] })) all.push(row);
  assert.equal(all.filter((r) => r.type === 'decision').length, 1);
  assert.equal((await TzuratItem.findById(it._id).lean()).exportedDecision, true);
  const since = new Date();
  await new Promise((r) => setTimeout(r, 5));
  const { adminItemAction } = await import('./items.js');
  await adminItemAction(it._id, { action: 'reopen' }, adminUser());
  const rows = [];
  for await (const row of exportRowsStream({ types: ['decision'], since })) rows.push(row);
  assert.deepEqual(
    rows.filter((r) => r.type === 'decision').map(({ at: _at, ...r }) => r),
    [{ type: 'decision', sourceKey: 'berakhot|g|R|20|rep', slug: 'berakhot', dafKey: pages[0].dafKey, status: 'retracted' }]
  );
});

test('an unfinished submission cannot be reviewed, even immediately after insertion', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const item = await TzuratItem.create({ sourceKey: 'berakhot|g|R|9|rep', slug: 'berakhot', dafKey: pages[0].dafKey, page: pages[0]._id, otz: ['א'], print: ['ב'] });
  const create = TzuratSubmission.create;
  t.mock.method(TzuratSubmission, 'create', async function (...args) {
    const sub = await create.apply(this, args);
    assert.equal(sub.status, 'processing');
    assert.equal((await approveSubmission(sub._id, adminUser())).status, 409);
    assert.equal((await rejectSubmission(sub._id, adminUser())).status, 409);
    return sub;
  });
  const r = await submitPage(pages[0]._id, user(u1), { itemAnswers: [{ item: String(item._id), choice: 'a' }] });
  assert.ok(r.ok, r.error);
  const sub = await TzuratSubmission.findById(r.submission).lean();
  assert.equal(sub.status, 'submitted');
  assert.equal(sub.itemAnswers.length, 1);
  assert.equal(String((await TzuratItem.findById(item._id).lean()).answers[0].submission), r.submission);
});

test('database failures preserve input/draft and resume every effect once on standalone MongoDB', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const page = pages[0];
  await claimPage(page._id, String(u1._id));
  await saveDraft(page._id, String(u1._id), { stage: 'submit', state: { note: 'keep me' } });
  const item = await TzuratItem.create({ sourceKey: 'berakhot|g|R|9|rep', slug: 'berakhot', dafKey: page.dafKey, page: page._id, otz: ['א'], print: ['ב'] });
  const body = {
    itemAnswers: [{ item: String(item._id), choice: 'a' }],
    manualItems: [{ block: 'g', ref: 'R', wi: 1, otz: ['קורין'], text: 'קורים' }],
    reports: [{ category: 'header', text: 'כותרת', regions: [] }],
  };
  const create = TzuratItem.create;
  let failManual = true;
  t.mock.method(TzuratItem, 'create', async function (...args) {
    if (args[0]?.manual && failManual) { failManual = false; throw new Error('test failure before manual write'); }
    return create.apply(this, args);
  });
  const writeReport = TzuratReport.updateOne;
  let failReport = true;
  t.mock.method(TzuratReport, 'updateOne', async function (...args) {
    const result = await writeReport.apply(this, args);
    if (failReport) { failReport = false; throw new Error('test failure after report write'); }
    return result;
  });
  assert.equal((await submitPage(page._id, user(u1), body)).code, 'retry');
  const pending = await TzuratSubmission.findOne().lean();
  assert.equal(pending.status, 'processing');
  assert.equal(pending.input.manualItems[0].text, 'קורים');
  assert.equal(await TzuratDraft.countDocuments({}), 1);
  assert.equal((await pageDetail(page._id, String(u1._id))).processing, true);
  assert.equal((await approveSubmission(pending._id, adminUser())).status, 409);
  assert.equal((await rejectSubmission(pending._id, adminUser())).status, 409);
  assert.equal((await submitPage(page._id, user(u1), body)).code, 'retry');
  assert.equal(await TzuratReport.countDocuments({}), 1);
  const attempts = await Promise.all([submitPage(page._id, user(u1), body), submitPage(page._id, user(u1), body)]);
  assert.equal(attempts.filter((r) => r.ok).length, 1);
  assert.equal(await TzuratSubmission.countDocuments({}), 1);
  const sub = await TzuratSubmission.findById(pending._id).lean();
  assert.equal(sub.status, 'submitted');
  assert.deepEqual([sub.itemAnswers.length, sub.manualItems.length, sub.reports.length], [1, 1, 1]);
  assert.equal(await TzuratReport.countDocuments({}), 1);
  assert.equal((await TzuratItem.findById(item._id).lean()).answers.length, 1);
  assert.equal((await TzuratItem.findById(sub.manualItems[0]).lean()).answers.length, 1);
  assert.equal((await TzuratPage.findById(page._id).lean()).activeCount, 1);
  assert.equal(await TzuratDraft.countDocuments({}), 0);
  assert.ok((await rejectSubmission(sub._id, adminUser())).ok);
  assert.equal((await TzuratItem.findById(item._id).lean()).answers.length, 0);
});

test('drafts and submissions reject an earlier build even when the round is unchanged', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = pages[0];
  const oldVersion = reviewVersion(p);
  await claimPage(p._id, String(u1._id));
  const draft = await saveDraft(p._id, String(u1._id), { stage: 'submit', state: { lineOps: [{ op: 'confirm', block: 'g', line: 1 }] } });
  await TzuratPage.updateOne({ _id: p._id }, { $set: { buildId: 'b2' } });
  assert.equal((await pageDetail(p._id, String(u1._id))).draft, null);
  assert.equal((await saveDraftRaw(p._id, String(u1._id), { version: oldVersion, stage: 'submit', state: {}, baseUpdatedAt: draft.updatedAt })).code, 'stale');
  assert.equal((await submitPageRaw(p._id, user(u1), { version: oldVersion, round: 1 })).code, 'stale');
  assert.equal(await TzuratSubmission.countDocuments({}), 0);
  const fresh = await saveDraft(p._id, String(u1._id), { stage: 'overview', state: {} });
  assert.ok(fresh.ok);
  assert.deepEqual((await pageDetail(p._id, String(u1._id))).draft.state, {});
});

test('the first exported anchor locks rejection before the stream is resumed', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const s = await submitPage(pages[0]._id, user(u1), { lineOps: [{ op: 'confirm', block: 'g', line: 1 }], checks: { blocks: 'ok' } });
  await approveSubmission(s.submission, adminUser());
  const stream = exportRowsStream({ types: ['anchor', 'check'] });
  assert.equal((await stream.next()).value.type, 'meta');
  assert.equal((await stream.next()).value.type, 'anchor');
  assert.equal((await rejectSubmission(s.submission, adminUser())).status, 409);
  assert.ok((await TzuratSubmission.findById(s.submission).lean()).exportedAt);
  assert.equal((await stream.next()).value.type, 'check');
  await stream.return();
  const s2 = await submitPage(pages[1]._id, user(u1), { lineOps: [{ op: 'confirm', block: 'g', line: 1 }] });
  await approveSubmission(s2.submission, adminUser());
  assert.ok((await rejectSubmission(s2.submission, adminUser())).ok);
  const rows = [];
  for await (const row of exportRowsStream({ types: ['anchor'] })) rows.push(row);
  assert.equal(rows.filter((r) => r.type === 'anchor').length, 1);
});

test('a rejected manual correction can be submitted again and rejected independently', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const body = { manualItems: [{ block: 'g', ref: 'R', wi: 1, otz: ['קורין'], text: 'קורים' }] };
  const first = await submitPage(pages[0]._id, user(u1), body);
  await rejectSubmission(first.submission, adminUser());
  assert.equal((await TzuratItem.findOne({ manual: true }).lean()).status, 'obsolete');
  const second = await submitPage(pages[0]._id, user(u1), body);
  assert.ok(second.ok);
  const item = await TzuratItem.findOne({ manual: true }).lean();
  assert.equal(item.status, 'open');
  assert.equal(item.answers.length, 1);
  assert.equal(String(item.answers[0].submission), second.submission);
  assert.deepEqual(second.warnings, []);
  await rejectSubmission(second.submission, adminUser());
  assert.equal((await TzuratItem.findById(item._id).lean()).answers.length, 0);
});

test('a build change between validation and slot reservation rejects the stale submission atomically', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const update = TzuratPage.findOneAndUpdate;
  t.mock.method(TzuratPage, 'findOneAndUpdate', async function (...args) {
    if (args[1]?.$inc?.activeCount === 1) await TzuratPage.updateOne({ _id: pages[0]._id }, { $set: { buildId: 'b2' } });
    return update.apply(this, args);
  });
  const r = await submitPageRaw(pages[0]._id, user(u1), { version: reviewVersion(pages[0]), round: 1 });
  assert.equal(r.code, 'stale');
  assert.equal((await TzuratPage.findById(pages[0]._id).lean()).activeCount, 0);
  assert.equal(await TzuratSubmission.countDocuments({}), 0);
});

test('an old tab cannot overwrite a newer-build draft created after its initial page read', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = pages[0];
  await claimPage(p._id, String(u1._id));
  const oldVersion = reviewVersion(p);
  const find = TzuratDraft.findOne;
  let changeBuild = true;
  t.mock.method(TzuratDraft, 'findOne', function (...args) {
    if (!changeBuild) return find.apply(this, args);
    changeBuild = false;
    const readDraft = find.bind(this);
    return { lean: async () => {
      await TzuratPage.updateOne({ _id: p._id }, { $set: { buildId: 'b2' } });
      assert.ok((await saveDraft(p._id, String(u1._id), { stage: 'overview', state: { note: 'fresh' } })).ok);
      return readDraft(...args).lean();
    } };
  });
  assert.equal((await saveDraftRaw(p._id, String(u1._id), { version: oldVersion, stage: 'lines', state: { note: 'old' } })).code, 'stale');
  assert.equal((await TzuratDraft.findOne().lean()).state.note, 'fresh');
});

test('a saved job remains recoverable after a new round without altering its counters or draft', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const write = TzuratReport.updateOne;
  let failOnce = true;
  t.mock.method(TzuratReport, 'updateOne', async function (...args) {
    if (failOnce) { failOnce = false; throw new Error('transient'); }
    return write.apply(this, args);
  });
  const p = pages[0];
  assert.equal((await submitPage(p._id, user(u1), { reports: [{ category: 'header', text: 'כותרת', regions: [] }] })).code, 'retry');
  await TzuratPage.updateOne({ _id: p._id }, { $set: { buildId: 'b2', round: 2, activeCount: 0, submitters: [], leasedBy: u2._id, leasedUntil: new Date(Date.now() + 60000) } });
  assert.ok((await saveDraft(p._id, String(u2._id), { stage: 'overview', state: { note: 'new round draft' } })).ok);
  const detail = await pageDetail(p._id, String(u1._id));
  assert.equal(detail.processing, true);
  const r = await submitPageRaw(p._id, user(u1), {});
  assert.ok(r.ok);
  assert.equal((await TzuratSubmission.findById(r.submission).lean()).round, 1);
  assert.equal((await TzuratPage.findById(p._id).lean()).activeCount, 0);
  assert.equal((await TzuratDraft.findOne().lean()).state.note, 'new round draft');
});

test('a question closed during submission keeps its original answer for the reviewer with an explicit warning', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const item = await TzuratItem.create({ sourceKey: 'berakhot|g|R|9|rep', slug: 'berakhot', dafKey: pages[0].dafKey, page: pages[0]._id, otz: ['א'], print: ['ב'] });
  const create = TzuratSubmission.create;
  t.mock.method(TzuratSubmission, 'create', async function (...args) {
    const sub = await create.apply(this, args);
    await TzuratItem.updateOne({ _id: item._id }, { $set: { status: 'resolved' } });
    return sub;
  });
  const choice = optionsFor(item, String(u1._id)).find((o) => o.words[0] === 'ב').id;
  const result = await submitPage(pages[0]._id, user(u1), { itemAnswers: [{ item: String(item._id), choice }] });
  assert.ok(result.ok);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /ב/);
  const sub = await TzuratSubmission.findById(result.submission).lean();
  assert.deepEqual(sub.answerIssues, result.warnings);
  assert.equal(sub.input.itemAnswers[0].verdict, 'print');
  assert.deepEqual(sub.input.itemAnswers[0].print, ['ב']);
  assert.equal((await TzuratItem.findById(item._id).lean()).answers.length, 0);
});

test('approval resumes after a crash without duplicating points or page counters', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const result = await submitPage(pages[0]._id, user(u1), {});
  const update = TzuratPage.updateOne;
  let failOnce = true;
  t.mock.method(TzuratPage, 'updateOne', async function (...args) {
    const value = await update.apply(this, args);
    if (failOnce && Array.isArray(args[1]) && args[1][0]?.$set?.approvalEvents) {
      failOnce = false;
      throw new Error('crash after approval counter');
    }
    return value;
  });
  await assert.rejects(approveSubmission(result.submission, adminUser()));
  let sub = await TzuratSubmission.findById(result.submission).lean();
  assert.deepEqual([sub.status, sub.reviewAction], ['submitted', 'approve']);
  assert.equal((await User.findById(u1._id).lean()).points, 10);
  assert.ok((await approveSubmission(result.submission, adminUser())).ok);
  sub = await TzuratSubmission.findById(result.submission).lean();
  assert.equal(sub.status, 'approved');
  assert.equal((await User.findById(u1._id).lean()).points, 10);
  assert.equal((await TzuratPage.findById(pages[0]._id).lean()).approvedCount, 1);
});

test('rejection resumes after a crash and reverses each effect once', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const item = await TzuratItem.create({ sourceKey: 'berakhot|g|R|77|rep', slug: 'berakhot', dafKey: pages[0].dafKey, page: pages[0]._id, otz: ['א'], print: ['ב'] });
  const result = await submitPage(pages[0]._id, user(u1), { itemAnswers: [{ item: String(item._id), choice: 'a' }] });
  await approveSubmission(result.submission, adminUser());
  const update = TzuratPage.updateOne;
  let failOnce = true;
  t.mock.method(TzuratPage, 'updateOne', async function (...args) {
    if (failOnce && Array.isArray(args[1]) && args[1][0]?.$set?.releaseEvents) {
      failOnce = false;
      throw new Error('crash before release counter');
    }
    return update.apply(this, args);
  });
  await assert.rejects(rejectSubmission(result.submission, adminUser()));
  let sub = await TzuratSubmission.findById(result.submission).lean();
  assert.deepEqual([sub.status, sub.reviewAction], ['approved', 'reject']);
  assert.equal((await TzuratItem.findById(item._id).lean()).answers.length, 0);
  assert.ok((await rejectSubmission(result.submission, adminUser())).ok);
  assert.equal((await User.findById(u1._id).lean()).points, 0);
  const page = await TzuratPage.findById(pages[0]._id).lean();
  assert.deepEqual([page.activeCount, page.approvedCount, page.status], [0, 0, 'open']);
});

test('export ACK locks only delivered approved submissions and is idempotent', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const first = await submitPage(pages[0]._id, user(u1), { lineOps: [{ op: 'confirm', block: 'g', line: 1 }] });
  await approveSubmission(first.submission, adminUser());
  const second = await submitPage(pages[1]._id, user(u1), {});
  await approveSubmission(second.submission, adminUser());
  const job = await TzuratExportJob.create({
    status: 'ready', submissions: [first.submission, second.submission],
    readyAt: new Date(), expiresAt: new Date(Date.now() + 60000),
  });
  assert.ok((await rejectSubmission(second.submission, adminUser())).ok);
  assert.ok((await acknowledgeExport(job._id)).ok);
  assert.ok((await TzuratSubmission.findById(first.submission).lean()).exportedAt);
  assert.equal((await TzuratSubmission.findById(second.submission).lean()).exportedAt, null);
  assert.ok((await acknowledgeExport(job._id)).ok);
  assert.equal((await rejectSubmission(first.submission, adminUser())).status, 409);
});

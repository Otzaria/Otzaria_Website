import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import FileStorage from '../../models/FileStorage.js';
import Upload from '../../models/Upload.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { saveFileToGridFS, getFileFromGridFS } from '../gridfs-service.js';
import { cleanupClosedReportPayloads, deleteReportPayloadFile, PAYLOAD_RETENTION_MS, CLEANUP_REPORT_BATCH, CLEANUP_FILE_BATCH, CLEANUP_RETRY_MS } from './retention.js';
import { handleIssueStateChange, trustedIssueClosedAt } from './state-change.js';
import { runAppReportsSync, serializeReport, ensureReplyToken, ingestInboundReply } from './service.js';
import { buildReplyAddress } from './inbound.js';
import { ANIMATED_GIF } from './testing/gif-fixtures.js';

let db, now, issues, seq;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  await mongoose.connection.db.collection('uploads.files').deleteMany({});
  await mongoose.connection.db.collection('uploads.chunks').deleteMany({});
  now = new Date('2026-11-05T12:00:00.000Z');
  issues = new Map();
  seq = 0;
});

const files = () => mongoose.connection.db.collection('uploads.files');
const chunks = () => mongoose.connection.db.collection('uploads.chunks');
const old = () => new Date(now.getTime() - PAYLOAD_RETENTION_MS);
const github = { getIssue: async (number) => {
  const issue = issues.get(number);
  if (issue instanceof Error) throw issue;
  return { ...issue };
} };
const deps = (extra = {}) => ({ now, clock: () => now, githubFor: () => github, ...extra });
const get = (report) => AppReport.findById(report._id).lean();
const keep = async (report) => assert.ok(await files().findOne({ _id: report.fileIds.diagnostics.gridfsId }));

async function report(over = {}, withFile = true) {
  const id = ++seq;
  const reportId = `retention-${id}`;
  const file = withFile ? await saveFileToGridFS(Buffer.from(`diagnostics-${id}`), 'diagnostics.json', 'application/json', { appReportId: reportId }) : null;
  const doc = await AppReport.create({
    reportId, type: 'bug', trigger: 'manual', title: `דיווח ${id}`, description: 'טקסט שנותר במעקב',
    contentHash: reportId, issueNumber: id, issueUrl: `https://github.com/Otzaria/otzaria/issues/${id}`,
    issueState: 'closed', issueClosedAt: old(), issuePending: false,
    ...(file ? { fileIds: { diagnostics: { gridfsId: file.gridfsId, size: file.size } } } : {}),
    ...over,
  });
  issues.set(id, { number: id, state: 'closed', closed_at: (over.issueClosedAt || old()).toISOString() });
  return doc.toObject();
}

async function extraFile(doc, kind = 'errors') {
  const file = await saveFileToGridFS(Buffer.from('עוד נתוני אבחון'), `${kind}.txt`, 'text/plain', { appReportId: doc.reportId });
  const ref = { gridfsId: file.gridfsId, size: file.size };
  await AppReport.updateOne({ _id: doc._id }, { $set: { [`fileIds.${kind}`]: ref } });
  return ref;
}

test('168 שעות בדיוק: לפני הגבול נשמר; בגבול ואחריו נמחק רק המטען', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const newer = await report({ issueClosedAt: new Date(old().getTime() + 1) });
  const exact = await report();
  const older = await report({ issueClosedAt: new Date(old().getTime() - 1) });
  const summary = await cleanupClosedReportPayloads(deps());
  assert.equal(summary.purged, 2);
  assert.equal(summary.files, 2);
  await keep(newer);
  assert.equal(await files().countDocuments(), 1);
  assert.equal(await chunks().countDocuments(), 1);
  for (const original of [exact, older]) {
    const saved = await get(original);
    assert.equal(saved.reportId, original.reportId);
    assert.equal(saved.title, original.title);
    assert.equal(saved.description, original.description);
    assert.equal(saved.issueState, 'closed');
    assert.equal(saved.issueUrl, original.issueUrl);
    assert.deepEqual(saved.createdAt, original.createdAt);
    assert.deepEqual(saved.payloadCleanup.purgedAt, now);
    assert.deepEqual(saved.payloadCleanup.closedAt, original.issueClosedAt);
    assert.equal(saved.fileIds.diagnostics, null);
    assert.equal(saved.payloadCleanup.removedFiles, 1);
  }
  assert.equal((await cleanupClosedReportPayloads(deps())).files, 0);
});

test('זמן שליחה, עדכון או הודעת סגירה אינם מועד סגירה; גם מצב פתוח או ממתין נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const variants = [
    { issueClosedAt: null, notifiedClosedAt: old() },
    { issueClosedAt: null, issueState: 'closed' },
    { issueState: 'open' },
    { issuePending: true },
    { issueNumber: null },
    { contactLog: [{ direction: 'in', issueComment: 'pending', message: 'ממתין לפרסום' }] },
    { contactLog: [{ direction: 'in', issueComment: 'posting', message: 'פרסום מתבצע' }] },
  ];
  for (const variant of variants) await report(variant);
  assert.equal((await cleanupClosedReportPayloads(deps())).checked, 0);
  assert.equal(await files().countDocuments(), variants.length);
  assert.equal(trustedIssueClosedAt({ state: 'closed', closed_at: 'invalid' }), null);
  assert.equal(trustedIssueClosedAt({ state: 'closed', closed_at: '2026' }), null);
  assert.equal(trustedIssueClosedAt({ state: 'closed', closed_at: '2026-02-30T00:00:00Z' }), null);
  assert.equal(trustedIssueClosedAt({ state: 'open', closed_at: old().toISOString() }), null);
});

test('פתיחה מחדש ללא webhook מתגלה בשליפה טרייה ואינה מוחקת צרופות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  issues.set(doc.issueNumber, { number: doc.issueNumber, state: 'open', closed_at: null });
  const summary = await cleanupClosedReportPayloads(deps());
  assert.equal(summary.deferred, 1);
  assert.equal((await get(doc)).issueClosedAt, null);
  assert.equal((await get(doc)).issueState, 'open');
  await keep(doc);
});

test('תשובת closed שיצאה לדרך לפני webhook פתיחה אינה דורסת את המצב העדכני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const result = await cleanupClosedReportPayloads(deps({ githubFor: () => ({ getIssue: async () => {
    const snapshot = { ...issues.get(doc.issueNumber) };
    await handleIssueStateChange({ number: doc.issueNumber, state: 'open', closed_at: null }, { now: new Date(now.getTime() + 1) });
    return snapshot;
  } }) }));
  assert.equal(result.files, 0);
  assert.equal(result.deferred, 1);
  assert.equal((await get(doc)).issueState, 'open');
  assert.equal((await get(doc)).issueClosedAt, null);
  await keep(doc);
});

test('רוויזיה מבטלת GET ישן גם כשנרשמו reopen ו־close באותה מילישנייה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report({ issueCheckedAt: now });
  const result = await cleanupClosedReportPayloads(deps({ githubFor: () => ({ getIssue: async () => {
    const snapshot = { ...issues.get(doc.issueNumber) };
    await handleIssueStateChange({ number: doc.issueNumber, state: 'open', closed_at: null }, { now });
    // גם שדות מצב וזמן זהים לחלוטין לא מעניקים הרשאה לתשובה מלפני המעברים.
    await handleIssueStateChange(snapshot, { now });
    return snapshot;
  } }) }));
  assert.equal(result.files, 0);
  assert.equal((await get(doc)).issueStateRevision, 2);
  await keep(doc);
});

test('רשומה ישנה בלי מונה מצב ובלי מטא־דטה של ניקוי נתמכת ללא מיגרציה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  await AppReport.collection.updateOne({ _id: doc._id }, { $unset: { issueStateRevision: '', payloadCleanup: '' } });
  const result = await cleanupClosedReportPayloads(deps());
  assert.equal(result.purged, 1);
  const saved = await get(doc);
  assert.equal(saved.issueStateRevision, 1);
  assert.equal(saved.payloadCleanup.removedFiles, 1);
});

test('סגירה חדשה שהתפספסה בסנכרון מתחילה מניין חדש לפי GitHub', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const newClosure = new Date(now);
  issues.set(doc.issueNumber, { number: doc.issueNumber, state: 'closed', closed_at: newClosure.toISOString() });
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 0);
  await keep(doc);
  now = new Date(newClosure.getTime() + PAYLOAD_RETENTION_MS - 1);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 0);
  now = new Date(newClosure.getTime() + PAYLOAD_RETENTION_MS);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
});

test('כשל חלקי, פתיחה מחדש וסגירה נוספת בין שני ניסיונות ניקוי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const second = await extraFile(doc);
  const first = await cleanupClosedReportPayloads(deps({ deletePayloadFile: async (id, owner) => {
    if (String(id) === String(second.gridfsId)) throw new Error('כשל זמני במחסן');
    return deleteReportPayloadFile(id, owner);
  } }));
  assert.equal(first.files, 1);
  assert.equal(first.errors, 1);
  const partial = await get(doc);
  assert.equal(partial.payloadCleanup.purgedAt, null);
  assert.equal(partial.payloadCleanup.removedFiles, 1);
  assert.deepEqual(partial.payloadCleanup.nextAttemptAt, new Date(now.getTime() + CLEANUP_RETRY_MS));
  assert.equal(partial.fileIds.diagnostics, null);
  assert.equal(partial.fileIds.errors, null);
  assert.equal(partial.payloadCleanup.pendingDeletes.length, 1);
  assert.ok(await files().findOne({ _id: second.gridfsId }));

  now = new Date(now.getTime() + CLEANUP_RETRY_MS);
  const opened = { number: doc.issueNumber, state: 'open', closed_at: null };
  issues.set(doc.issueNumber, opened);
  await handleIssueStateChange(opened, { now });
  // הניתוק כבר committed לפני ה-reopen; התור העמיד משלים רק את המחיקה הפיזית.
  assert.equal((await cleanupClosedReportPayloads(deps())).files, 1);
  assert.equal((await get(doc)).payloadCleanup.pendingDeletes.length, 0);
  const closedAgain = new Date(now);
  const closed = { number: doc.issueNumber, state: 'closed', closed_at: closedAgain.toISOString() };
  issues.set(doc.issueNumber, closed);
  await handleIssueStateChange(closed, { now });
  now = new Date(closedAgain.getTime() + PAYLOAD_RETENTION_MS - 1);
  assert.equal((await cleanupClosedReportPayloads(deps())).files, 0);
  assert.equal(await files().findOne({ _id: second.gridfsId }), null);
  now = new Date(closedAgain.getTime() + PAYLOAD_RETENTION_MS);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
  assert.equal((await get(doc)).payloadCleanup.removedFiles, 2);
  assert.equal((await cleanupClosedReportPayloads(deps())).files, 0);
});

test('מחיקה חלקית ב־GridFS: מסמך חסר, chunks שנותרו והרצה חוזרת בטוחה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const id = doc.fileIds.diagnostics.gridfsId;
  await files().deleteOne({ _id: id });
  assert.ok(await chunks().findOne({ files_id: id }));
  const summary = await cleanupClosedReportPayloads(deps());
  assert.equal(summary.errors, 0);
  assert.equal(summary.missing, 1);
  assert.equal(summary.purged, 1);
  assert.equal(await chunks().countDocuments(), 0);
  assert.equal((await FileStorage.findOne({ gridfsId: id }).lean()).isDeleted, true);
  assert.equal((await cleanupClosedReportPayloads(deps())).files, 0);
});

test('שתי רשומות חולקות קובץ: הדיווח הפעיל שומר גישה לבתים עד שגם הוא זכאי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const closed = await report();
  const active = await report({ issueState: 'open', issueClosedAt: null, fileIds: closed.fileIds }, false);
  issues.set(active.issueNumber, { number: active.issueNumber, state: 'open', closed_at: null });
  const originalBytes = await getFileFromGridFS(closed.fileIds.diagnostics.gridfsId);
  const summary = await cleanupClosedReportPayloads(deps());
  assert.equal(summary.shared, 1);
  assert.equal(summary.bytes, 0);
  assert.equal(summary.purged, 1);
  assert.equal((await get(closed)).fileIds.diagnostics, null);
  const live = await get(active);
  assert.deepEqual(await getFileFromGridFS(live.fileIds.diagnostics.gridfsId), originalBytes);
  await AppReport.updateOne({ _id: active._id }, { $set: { issueState: 'closed', issueClosedAt: old() } });
  issues.set(active.issueNumber, { number: active.issueNumber, state: 'closed', closed_at: old().toISOString() });
  assert.equal((await cleanupClosedReportPayloads(deps())).files, 1);
  assert.equal(await files().countDocuments(), 0);
});

test('קובץ משותף להעלאת ספר פעילה אינו נמחק', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const storage = await FileStorage.findOne({ gridfsId: doc.fileIds.diagnostics.gridfsId });
  await Upload.create({ bookName: 'ספר בדיקה', fileStorageId: storage._id });
  assert.equal((await cleanupClosedReportPayloads(deps())).shared, 1);
  await keep(doc);
  assert.equal((await FileStorage.findById(storage._id).lean()).isDeleted, false);
});

test('כשל API, 404, תאריך חסר/פגום/עתידי או חוסר תצורה אינם מתירים מחיקה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const unavailable = await report();
  issues.set(unavailable.issueNumber, Object.assign(new Error('לא נמצא'), { status: 404 }));
  for (const date of [null, 'invalid', new Date(now.getTime() + 1).toISOString()]) {
    const doc = await report();
    issues.set(doc.issueNumber, { number: doc.issueNumber, state: 'closed', closed_at: date });
  }
  const summary = await cleanupClosedReportPayloads(deps());
  assert.equal(summary.purged, 0);
  assert.equal(summary.errors, 1);
  assert.equal(await files().countDocuments(), 4);
  now = new Date(now.getTime() + CLEANUP_RETRY_MS);
  assert.equal((await cleanupClosedReportPayloads({ now })).purged, 0);
  assert.equal(await files().countDocuments(), 4);
});

test('תג בעלות זר נדחה ונשמר לניסיון נוסף במקום מחיקה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  await files().updateOne({ _id: doc.fileIds.diagnostics.gridfsId }, { $unset: { metadata: '' } });
  assert.equal((await cleanupClosedReportPayloads(deps())).errors, 1);
  await keep(doc);
  assert.equal((await get(doc)).payloadCleanup.purgedAt, null);
});

test('תג בעלות של דיווח אחר נדחה לפני ניתוק ההפניה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  await files().updateOne(
    { _id: doc.fileIds.diagnostics.gridfsId },
    { $set: { 'metadata.appReportId': 'retention-someone-else' } },
  );
  assert.equal((await cleanupClosedReportPayloads(deps())).errors, 1);
  const saved = await get(doc);
  assert.ok(saved.fileIds.diagnostics);
  assert.equal(saved.payloadCleanup.pendingDeletes.length, 0);
  await keep(doc);
});

test('שינוי בעלות אחרי הניתוק אינו מוחק קובץ זר, וה-pending נשמר לניסיון בטוח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const gridfsId = doc.fileIds.diagnostics.gridfsId;
  const first = await cleanupClosedReportPayloads(deps({ deletePayloadFile: async (id, owner) => {
    await files().updateOne({ _id: id }, { $set: { 'metadata.appReportId': 'retention-someone-else' } });
    return deleteReportPayloadFile(id, owner);
  } }));
  assert.equal(first.errors, 1);
  const pending = await get(doc);
  assert.equal(pending.fileIds.diagnostics, null);
  assert.equal(pending.payloadCleanup.pendingDeletes.length, 1);
  assert.ok(await files().findOne({ _id: gridfsId }));

  await files().updateOne({ _id: gridfsId }, { $set: { 'metadata.appReportId': doc.reportId } });
  now = new Date(now.getTime() + CLEANUP_RETRY_MS);
  assert.equal((await cleanupClosedReportPayloads(deps())).files, 1);
  assert.equal((await get(doc)).payloadCleanup.pendingDeletes.length, 0);
  assert.equal(await files().findOne({ _id: gridfsId }), null);
});

test('ריצות מקבילות אינן מוחקות או מונות קובץ פעמיים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  let deletes = 0;
  const input = deps({ deletePayloadFile: async (id, owner) => { deletes += 1; return deleteReportPayloadFile(id, owner); } });
  const results = await Promise.all([cleanupClosedReportPayloads(input), cleanupClosedReportPayloads(input)]);
  assert.equal(deletes, 1);
  assert.equal(results.reduce((n, r) => n + r.files, 0), 1);
  assert.equal((await get(doc)).payloadCleanup.removedFiles, 1);
});

test('תקרת מנות: דיווחים וקבצים הנותרים ממשיכים בריצה הבאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (let i = 0; i < CLEANUP_REPORT_BATCH + 1; i += 1) await report();
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, CLEANUP_REPORT_BATCH);
  assert.equal(await files().countDocuments(), 1);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);

  const doc = await report({}, false);
  const images = [];
  for (let i = 0; i < CLEANUP_FILE_BATCH + 1; i += 1) {
    const file = await saveFileToGridFS(Buffer.from(`image-${i}`), 'image.gif', 'image/gif', { appReportId: doc.reportId });
    images.push({ gridfsId: file.gridfsId, size: file.size, mimeType: 'image/gif' });
  }
  await AppReport.updateOne({ _id: doc._id }, { $set: { contactLog: [{ direction: 'in', issueComment: 'posted', images }] } });
  assert.equal((await cleanupClosedReportPayloads(deps())).files, CLEANUP_FILE_BATCH);
  assert.equal((await get(doc)).payloadCleanup.purgedAt, null);
  assert.equal(await files().countDocuments(), 1);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
  assert.equal((await get(doc)).payloadCleanup.removedFiles, CLEANUP_FILE_BATCH + 1);
});

test('פתיחה מחדש במהלך הריצה מבטלת את מחיקת יתר הקבצים ואת סימון ההשלמה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const second = await extraFile(doc);
  let count = 0;
  await cleanupClosedReportPayloads(deps({ deletePayloadFile: async (id, owner) => {
    count += 1;
    const result = await deleteReportPayloadFile(id, owner);
    await handleIssueStateChange({ number: doc.issueNumber, state: 'open' }, { now });
    return result;
  } }));
  assert.equal(count, 1);
  assert.ok(await files().findOne({ _id: second.gridfsId }));
  const saved = await get(doc);
  assert.equal(saved.issueState, 'open');
  assert.equal(saved.payloadCleanup.purgedAt, null);
  assert.equal(saved.fileIds.diagnostics, null);
  assert.equal(saved.payloadCleanup.pendingDeletes.length, 0);
});

test('ה־cron הקיים משלים מועד אמין לדיווח ישן ומפעיל ניקוי; תוצאת הניהול אינה חושפת נעילה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report({ issueClosedAt: null });
  const result = await runAppReportsSync(deps({ sendClosedMail: async () => ({ sent: true }) }));
  assert.equal(result.cleanup.purged, 1);
  const saved = await get(doc);
  const serialized = serializeReport(saved, 'admin');
  assert.ok(serialized.payloadCleanup.purgedAt);
  assert.equal('leaseToken' in serialized.payloadCleanup, false);
  assert.equal('lastError' in serialized.payloadCleanup, false);
  assert.equal(saved.issueClosedAt.getTime(), old().getTime());
});

test('תמונת מייל חדשה אחרי ניקוי נשמרת, מבטלת סימון השלמה ונקלטת בניקוי הבא', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
  const token = await ensureReplyToken(doc.reportId);
  const response = await ingestInboundReply({
    to: buildReplyAddress(token, 'reply.otzaria.org'), from: 'reply@example.com',
    subject: 'תמונה נוספת', text: 'פרטי המקרה', messageId: '<retention-reply@example.com>',
    attachments: 1, images: [{ fileName: 'new.gif', mimeType: 'image/gif', data: ANIMATED_GIF.toString('base64') }],
  }, deps({ saveFile: saveFileToGridFS, deleteFile: deleteReportPayloadFile, config: {} }));
  assert.equal(response.status, 200);
  const saved = await get(doc);
  assert.equal(saved.payloadCleanup.purgedAt, null);
  assert.equal(saved.contactLog[0].issueComment, 'held');
  assert.deepEqual(await getFileFromGridFS(saved.contactLog[0].images[0].gridfsId), ANIMATED_GIF);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
  const final = await get(doc);
  assert.equal(final.contactLog[0].message, 'פרטי המקרה');
  assert.equal(final.contactLog[0].images.length, 0);
  assert.equal(final.payloadCleanup.removedFiles, 2);
});

async function inboundImage(doc) {
  const token = await ensureReplyToken(doc.reportId);
  return ingestInboundReply({
    to: buildReplyAddress(token, 'reply.otzaria.org'), from: 'other@example.com',
    subject: 'תמונה במקביל לניקוי', text: 'פרטים נוספים', messageId: `<${doc.reportId}-race@example.com>`,
    attachments: 1, images: [{ fileName: 'new.gif', mimeType: 'image/gif', data: ANIMATED_GIF.toString('base64') }],
  }, deps({ saveFile: saveFileToGridFS, deleteFile: deleteReportPayloadFile, config: {} }));
}

for (const legacy of [false, true]) {
  test(`תמונה שנקלטת לפני כתיבת סיום הניקוי אינה מסומנת כנקייה; legacy=${legacy}`, async (t) => {
    if (db.skip) return t.skip(db.skip);
    const doc = await report();
    if (legacy) await AppReport.collection.updateOne({ _id: doc._id }, { $unset: { issueStateRevision: '', payloadCleanup: '' } });
    const originalExec = mongoose.Query.prototype.exec;
    let delivered = false;
    const mock = t.mock.method(mongoose.Query.prototype, 'exec', async function (...args) {
      if (!delivered && this.model === AppReport && this.op === 'updateOne' && this.getUpdate()?.$set?.['payloadCleanup.purgedAt'] instanceof Date) {
        delivered = true;
        assert.equal((await inboundImage(doc)).status, 200);
      }
      return originalExec.apply(this, args);
    });
    const summary = await cleanupClosedReportPayloads(deps());
    mock.mock.restore();
    assert.equal(delivered, true);
    assert.equal(summary.purged, 0);
    const saved = await get(doc);
    assert.equal(saved.payloadCleanup.purgedAt, null);
    assert.equal(saved.payloadCleanup.leaseToken, null);
    assert.equal(saved.contactLog[0].issueComment, 'held');
    assert.deepEqual(await getFileFromGridFS(saved.contactLog[0].images[0].gridfsId), ANIMATED_GIF);
    assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
    assert.equal((await get(doc)).contactLog[0].images.length, 0);
  });
}

test('תמונה שנקלטת אחרי כתיבת ההשלמה מבטלת אותה גם אם אישור הכתיבה אבד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const originalExec = mongoose.Query.prototype.exec;
  let delivered = false;
  const mock = t.mock.method(mongoose.Query.prototype, 'exec', async function (...args) {
    const result = await originalExec.apply(this, args);
    if (!delivered && this.model === AppReport && this.op === 'updateOne' && this.getUpdate()?.$set?.['payloadCleanup.purgedAt'] instanceof Date) {
      delivered = true;
      assert.equal((await inboundImage(doc)).status, 200);
      throw new Error('completion write acknowledgement lost');
    }
    return result;
  });
  const summary = await cleanupClosedReportPayloads(deps());
  mock.mock.restore();
  assert.equal(delivered, true);
  assert.equal(summary.errors, 1);
  const saved = await get(doc);
  assert.equal(saved.payloadCleanup.purgedAt, null);
  assert.equal(saved.payloadCleanup.leaseToken, null);
  assert.deepEqual(await getFileFromGridFS(saved.contactLog[0].images[0].gridfsId), ANIMATED_GIF);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
});

test('מייל שהכתיבה שלו נשמרה אך אישורה אבד אינו נדרס בכתיבת סיום הניקוי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await report();
  const originalExec = mongoose.Query.prototype.exec;
  let delivered = false;
  let lostReplyAck = false;
  const mock = t.mock.method(mongoose.Query.prototype, 'exec', async function (...args) {
    if (!delivered && this.model === AppReport && this.op === 'updateOne' && this.getUpdate()?.$set?.['payloadCleanup.purgedAt'] instanceof Date) {
      delivered = true;
      await assert.rejects(inboundImage(doc), /reply write acknowledgement lost/);
    }
    const result = await originalExec.apply(this, args);
    if (!lostReplyAck && this.model === AppReport && this.op === 'updateOne' && this.getUpdate()?.$push?.contactLog?.images?.length) {
      lostReplyAck = true;
      throw new Error('reply write acknowledgement lost');
    }
    return result;
  });
  const summary = await cleanupClosedReportPayloads(deps());
  mock.mock.restore();
  assert.equal(delivered, true);
  assert.equal(lostReplyAck, true);
  assert.equal(summary.purged, 0);
  const saved = await get(doc);
  assert.equal(saved.payloadCleanup.purgedAt, null);
  assert.deepEqual(await getFileFromGridFS(saved.contactLog[0].images[0].gridfsId), ANIMATED_GIF);
  assert.equal((await cleanupClosedReportPayloads(deps())).purged, 1);
});

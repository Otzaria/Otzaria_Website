/**
 * לוגיקת דיווחי התוכנה בלי תלות ב-Next: קליטה, פרסום ל-GitHub, סנכרון מצב, יצירת קשר.
 * תלויות חיצוניות (קבצים, מייל, GitHub) מוזרקות כדי שהבדיקות ירוצו מול Mongo אמיתי.
 */
import crypto from 'node:crypto';
import AppReport from '../../models/AppReport.js';
import { validateAppReport, IMAGE_TYPES } from './validation.js';
import { computeContentHash, computeSignatureHash } from './hashes.js';
import { buildIssueTitle, buildIssueBody, buildMergeComment, issueLabels } from './issue-text.js';
import { createGithubClient, issueHtmlUrl } from './github.js';
import { handleIssueStateChange } from './state-change.js';
import { planPublication } from './merge.js';
import { verifyUnsubscribeToken } from './unsubscribe.js';
import {
  newReplyToken, buildReplyAddress, validateInboundPayload, isAutoReply, inboundMessageBody, buildInboundComment,
} from './inbound.js';
import { PRODUCT_KEYS, getProduct, productFilter, productOf } from './products.js';
export { hasAppReportsAccess } from '../roles.js';

const LEASE_MS = 2 * 60 * 1000;
export const PENDING_BATCH = 20;
export const STATE_BATCH = 30;
export const INBOUND_BATCH = 20;

/** לקוח GitHub לריפו של המוצר; deps.githubFor מחליף אותו (בדיקות). null כשאין טוקן. */
function githubFor(deps, product) {
  if (deps.githubFor) return deps.githubFor(product);
  if (!deps.config?.githubToken) return null;
  return createGithubClient({ token: deps.config.githubToken, repo: getProduct(product).repo, fetchImpl: deps.fetchImpl });
}

const replyFor = (doc, extra = {}) => ({
  success: true,
  reportId: doc.reportId,
  issueNumber: doc.issueNumber ?? null,
  issueUrl: doc.issueUrl ?? null,
  duplicate: false,
  merged: Boolean(doc.mergedIntoExisting),
  issuePending: Boolean(doc.issuePending),
  ...extra,
});

export const IMAGE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const newImageToken = () => crypto.randomBytes(24).toString('base64url');

async function storeAttachments(report, value, saveFile) {
  const fileIds = { diagnostics: null, errors: null, minidump: null, images: [] };
  if (value.diagnostics) {
    const buf = Buffer.from(JSON.stringify(value.diagnostics, null, 2), 'utf8');
    const saved = await saveFile(buf, `app-report-${report.reportId}-diagnostics.json`, 'application/json', { appReportId: report.reportId });
    fileIds.diagnostics = { gridfsId: saved.gridfsId, size: buf.length };
  }
  if (value.errorLog) {
    const buf = Buffer.from(value.errorLog, 'utf8');
    const saved = await saveFile(buf, `app-report-${report.reportId}-errors.txt`, 'text/plain; charset=utf-8', { appReportId: report.reportId });
    fileIds.errors = { gridfsId: saved.gridfsId, size: buf.length };
  }
  if (value.minidump) {
    const { buffer } = value.minidump;
    const saved = await saveFile(buffer, `app-report-${report.reportId}-minidump.dmp`, 'application/octet-stream', { appReportId: report.reportId });
    fileIds.minidump = { gridfsId: saved.gridfsId, size: buffer.length, fileName: value.minidump.fileName };
  }
  for (const [i, image] of (value.images || []).entries()) {
    const ext = IMAGE_TYPES[image.mimeType].ext;
    const saved = await saveFile(image.buffer, `app-report-${report.reportId}-image-${i + 1}.${ext}`, image.mimeType, { appReportId: report.reportId });
    fileIds.images.push({
      gridfsId: saved.gridfsId, size: image.buffer.length, mimeType: image.mimeType, fileName: image.fileName,
      publicToken: newImageToken(),
    });
  }
  return fileIds;
}

/**
 * קליטת דיווח מאומת. מחזיר {status, body}.
 * @param {unknown} raw
 * @param {{saveFile:Function, deleteFile:Function, config:object, githubFor?:Function, fetchImpl?:Function}} deps
 */
export async function ingestAppReport(raw, deps) {
  const v = await validateAppReport(raw);
  if (!v.ok) return { status: v.status, body: { error: v.error, field: v.field } };
  const value = v.value;
  const contentHash = computeContentHash(value);
  const signatureHash = computeSignatureHash(value.signature);

  const doc = {
    reportId: value.reportId, schema: 1, product: value.product, type: value.type, trigger: value.trigger, title: value.title,
    description: value.description, stepsToReproduce: value.stepsToReproduce, reporterEmail: value.reporterEmail || null,
    appVersion: value.appVersion, platform: value.platform, osVersion: value.osVersion, arch: value.arch,
    signature: value.signature, sentryEventId: value.sentryEventId, clientCreatedAt: value.clientCreatedAt,
    contentHash, signatureHash, issuePending: true,
  };

  const before = await AppReport.findOneAndUpdate(
    { reportId: value.reportId },
    { $setOnInsert: doc },
    { upsert: true, returnDocument: 'before' },
  ).lean();

  if (before) {
    if (before.contentHash !== contentHash) return { status: 409, body: { error: 'reportId conflict' } };
    return { status: 200, body: replyFor(before, { duplicate: true }) };
  }

  const savedFileIds = [];
  const saveAttachment = async (...args) => {
    const saved = await deps.saveFile(...args);
    savedFileIds.push(saved.gridfsId);
    return saved;
  };
  try {
    const fileIds = await storeAttachments(doc, value, saveAttachment);
    if (fileIds.diagnostics || fileIds.errors || fileIds.minidump || fileIds.images.length) await AppReport.updateOne({ reportId: value.reportId }, { $set: { fileIds } });
  } catch (err) {
    // בלי הקבצים הדיווח חסר ערך; מוחקים כדי שהלקוח ישלח שוב (5xx = תור וניסיון חוזר)
    console.error('App report: attachment storage failed:', err?.message);
    const removed = await AppReport.deleteOne({ reportId: value.reportId, issueNumber: null });
    // מנקים רק אחרי מחיקת הדיווח: ייתכן שהעדכון נשמר למרות השגיאה וה-cron כבר פרסם אותו.
    // אחרת כל ניסיון חוזר של דיווח שנמחק משאיר עותק יתום של הקבצים שנשמרו לפני הכשל.
    if (removed.deletedCount) {
      for (const gridfsId of savedFileIds) {
        try {
          await deps.deleteFile(String(gridfsId));
        } catch (cleanupError) {
          console.error('App report: attachment cleanup failed:', gridfsId, cleanupError?.message);
        }
      }
    }
    return { status: 500, body: { error: 'Failed to store attachments' } };
  }

  const published = await publishReport(value.reportId, deps);
  return { status: 200, body: replyFor(published) };
}

/**
 * יצירת issue או תגובה על issue פתוח עם אותה חתימה. כשל משאיר issuePending ל-cron.
 * @returns {Promise<object>} מסמך הדיווח העדכני
 */
export async function publishReport(reportId, deps) {
  const now = deps.now || new Date();
  const current = () => AppReport.findOne({ reportId }).lean();
  const target = await AppReport.findOne({ reportId }).select('product').lean();
  if (!target) return null;
  // ה-issue, האיחוד לפי חתימה והסימון כסגור — כולם בתוך המוצר של הדיווח בלבד
  const product = productOf(target);
  const scope = productFilter(product);
  const github = githubFor(deps, product);
  if (!github) return current();

  // הנעילה נמדדת בשעון אמיתי: ריצת cron ארוכה מחזיקה now ישן, ונעילה שחושבה ממנו כבר פגה
  const leaseNow = new Date();
  const leased = await AppReport.findOneAndUpdate(
    { reportId, issuePending: true, $or: [{ issueLeaseUntil: null }, { issueLeaseUntil: { $lt: leaseNow } }] },
    { $set: { issueLeaseUntil: new Date(leaseNow.getTime() + LEASE_MS), issueAttemptAt: leaseNow } },
    { returnDocument: 'after' },
  ).lean();
  if (!leased) return current();

  let plan = null;
  try {
    // דיווח אחר עם אותה חתימה נמצא כרגע בפרסום — משאירים ממתין כדי לא ליצור issue כפול
    const racing = leased.signatureHash
      ? await AppReport.exists({ ...scope, signatureHash: leased.signatureHash, reportId: { $ne: reportId }, issuePending: true, issueLeaseUntil: { $gt: leaseNow } })
      : null;

    const related = leased.signatureHash
      ? await AppReport.find({ ...scope, signatureHash: leased.signatureHash, issueNumber: { $ne: null }, reportId: { $ne: reportId } })
        .select('issueNumber issueState issueUrl createdAt').lean()
      : [];
    plan = planPublication(related);
    if (racing && plan.action === 'create') {
      return await AppReport.findOneAndUpdate({ reportId }, { $set: { issueLeaseUntil: null } }, { returnDocument: 'after' }).lean();
    }

    let set;
    if (plan.action === 'comment') {
      await github.createComment(plan.issueNumber, buildMergeComment(leased));
      set = {
        issueNumber: plan.issueNumber, issueUrl: plan.issueUrl || issueHtmlUrl(github.repo, plan.issueNumber),
        issueState: 'open', mergedIntoExisting: true,
      };
    } else {
      const { previousIssueNumber } = plan;
      const created = await github.createIssue({
        title: buildIssueTitle(leased),
        body: buildIssueBody(leased, { previousIssueNumber }),
        labels: issueLabels(leased),
      });
      set = {
        issueNumber: created.number, issueUrl: created.url || issueHtmlUrl(github.repo, created.number),
        issueState: created.state === 'closed' ? 'closed' : 'open', mergedIntoExisting: false, previousIssueNumber,
      };
    }
    return await AppReport.findOneAndUpdate(
      { reportId },
      { $set: { ...set, issuePending: false, issueLeaseUntil: null, issueError: null, issueCheckedAt: now } },
      { returnDocument: 'after' },
    ).lean();
  } catch (err) {
    console.error('App report: GitHub publish failed:', err?.message);
    // ה-issue נמחק או ננעל: בלי סימונו כסגור כל דיווח נוסף עם אותה חתימה יישאר ממתין לנצח
    if (plan?.action === 'comment' && (err?.status === 404 || err?.status === 410 || (err?.status === 403 && /locked/i.test(String(err?.message))))) {
      await AppReport.updateMany({ ...scope, issueNumber: plan.issueNumber }, { $set: { issueState: 'closed' } });
    }
    return AppReport.findOneAndUpdate(
      { reportId },
      { $set: { issueLeaseUntil: null, issueError: String(err?.message || err).slice(0, 500) } },
      { returnDocument: 'after' },
    ).lean();
  }
}

/**
 * ריצת ה-cron: קודם דיווחים ממתינים, אחר כך בדיקת מצב ה-issues (הישנים ביותר שנבדקו קודם).
 * כל מוצר בנפרד, עם הלקוח לריפו שלו ותקרות משלו — מוצר אחד עמוס לא יחסום את השני.
 * @param {{sendClosedMail:Function, config:object, githubFor?:Function, fetchImpl?:Function, now?:Date}} deps
 */
export async function runAppReportsSync(deps) {
  const now = deps.now || new Date();
  const clients = new Map(PRODUCT_KEYS.map((key) => [key, githubFor(deps, key)]));
  const summary = {
    githubConfigured: [...clients.values()].some(Boolean),
    pending: { attempted: 0, published: 0 },
    states: { checked: 0, closed: 0, notified: 0, failed: 0, errors: 0 },
    inbound: { reports: 0, posted: 0, errors: 0 },
  };
  const d = { ...deps, githubFor: (key) => clients.get(key) ?? null, now };
  for (const [product, github] of clients) {
    if (github) await syncProduct(product, github, d, summary);
  }
  return summary;
}

async function syncProduct(product, github, d, summary) {
  const { now } = d;
  const scope = productFilter(product);
  const pending = await AppReport.find({ ...scope, issuePending: true, $or: [{ issueLeaseUntil: null }, { issueLeaseUntil: { $lt: now } }] })
    // לפי מועד הניסיון האחרון: דיווח שנכשל תמיד (כותרת פסולה, issue חסום) לא יחסום את התור
    .select('reportId').sort({ issueAttemptAt: 1, createdAt: 1 }).limit(PENDING_BATCH).lean();
  for (const p of pending) {
    summary.pending.attempted += 1;
    const r = await publishReport(p.reportId, d);
    if (r && !r.issuePending) summary.pending.published += 1;
  }

  // תשובות במייל שעוד לא פורסמו ב-issue (ה-issue נוצר מאוחר יותר, או ש-GitHub נכשל בקליטה)
  const withReplies = await AppReport.find({
    ...scope,
    issueNumber: { $ne: null },
    contactLog: { $elemMatch: { direction: 'in', issueComment: 'pending' } },
  }).select('reportId').sort({ lastInboundAt: 1 }).limit(INBOUND_BATCH).lean();
  for (const { reportId } of withReplies) {
    summary.inbound.reports += 1;
    const r = await postInboundComments(reportId, d);
    summary.inbound.posted += r.posted;
    summary.inbound.errors += r.errors;
  }

  const issues = await AppReport.aggregate([
    { $match: { ...scope, issueNumber: { $ne: null } } },
    { $group: { _id: '$issueNumber', checkedAt: { $min: '$issueCheckedAt' } } },
    { $sort: { checkedAt: 1, _id: 1 } },
    { $limit: STATE_BATCH },
  ]);
  for (const { _id: number } of issues) {
    try {
      const issue = await github.getIssue(number);
      const r = await handleIssueStateChange(issue, { ...d, product });
      summary.states.checked += 1;
      if (r.transition === 'closed') summary.states.closed += 1;
      summary.states.notified += r.notified;
      summary.states.failed += r.failed;
    } catch (err) {
      summary.states.errors += 1;
      console.error(`App report sync: ${product} issue #${number} failed:`, err?.message);
      // issue שנמחק/הועבר לא יחסום את התור
      if (err?.status === 404 || err?.status === 410) {
        await AppReport.updateMany({ ...scope, issueNumber: number }, { $set: { issueCheckedAt: now } });
      }
    }
  }
}

/** המייל חשוף למנהל כללי בלבד. */
export function serializeReport(doc, role) {
  if (!doc) return null;
  // replyToken הוא הרשאה לכתוב לדיווח (מי שמחזיק בו יכול לשלוח "תשובה") — לא יוצא מהשרת
  const { reporterEmail, issueLeaseUntil, contentHash, replyToken, __v, ...rest } = doc;
  return {
    ...rest,
    product: productOf(doc),
    _id: String(doc._id),
    hasEmail: Boolean(reporterEmail),
    ...(role === 'admin' ? { reporterEmail: reporterEmail || null } : {}),
    fileIds: undefined,
    files: {
      diagnostics: doc.fileIds?.diagnostics ? { size: doc.fileIds.diagnostics.size } : null,
      errors: doc.fileIds?.errors ? { size: doc.fileIds.errors.size } : null,
      minidump: doc.fileIds?.minidump ? { size: doc.fileIds.minidump.size, fileName: doc.fileIds.minidump.fileName || '' } : null,
      images: (doc.fileIds?.images || []).map(({ size, mimeType, fileName }) => ({ size, mimeType, fileName })),
    },
    contactLog: (doc.contactLog || []).map(({ fromEmail, ...c }) => ({
      ...c,
      direction: c.direction || 'out',
      byUserId: c.byUserId ? String(c.byUserId) : null,
      ...(role === 'admin' && fromEmail ? { fromEmail } : {}),
    })),
  };
}

export const LIST_FILTERS = Object.freeze({
  product: PRODUCT_KEYS,
  type: ['bug', 'crash', 'performance', 'suggestion'],
  trigger: ['manual', 'crash_prompt', 'auto_crash'],
  issueState: ['open', 'closed', 'pending'],
});

export async function listReports({ product, type, trigger, issueState, page = 1, limit = 50 }, role) {
  const q = LIST_FILTERS.product.includes(product) ? productFilter(product) : {};
  if (LIST_FILTERS.type.includes(type)) q.type = type;
  if (LIST_FILTERS.trigger.includes(trigger)) q.trigger = trigger;
  if (issueState === 'pending') q.issuePending = true;
  else if (LIST_FILTERS.issueState.includes(issueState)) q.issueState = issueState;
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
  const [items, total] = await Promise.all([
    AppReport.find(q).select('-contactLog -signature').sort({ createdAt: -1 }).skip((pageNum - 1) * size).limit(size).lean(),
    AppReport.countDocuments(q),
  ]);
  return { reports: items.map((d) => serializeReport(d, role)), total, page: pageNum, limit: size };
}

export async function getReportDetail(reportId, role) {
  const doc = await AppReport.findOne({ reportId }).lean();
  if (!doc) return null;
  const related = doc.issueNumber
    ? await AppReport.find({ ...productFilter(productOf(doc)), issueNumber: doc.issueNumber, reportId: { $ne: reportId } })
      .select('reportId title type trigger appVersion platform createdAt').sort({ createdAt: -1 }).limit(200).lean()
    : [];
  return {
    report: serializeReport(doc, role),
    related: related.map((r) => ({ ...r, _id: String(r._id) })),
  };
}

export const FILE_KINDS = Object.freeze({
  diagnostics: { filename: 'diagnostics.json', contentType: 'application/json; charset=utf-8' },
  errors: { filename: 'errors.txt', contentType: 'text/plain; charset=utf-8' },
  // באתר בלבד: לא מקושר מה-issue ואין לו טוקן ציבורי
  minidump: { filename: 'crash.dmp', contentType: 'application/octet-stream' },
});

/** @returns {Promise<{buffer:Buffer, filename:string, contentType:string}|null>} */
export async function loadReportFile(reportId, kind, readFile) {
  const meta = FILE_KINDS[kind];
  if (!meta) return null;
  const doc = await AppReport.findOne({ reportId }).select('fileIds').lean();
  const ref = doc?.fileIds?.[kind];
  if (!ref?.gridfsId) return null;
  return { buffer: await readFile(String(ref.gridfsId)), ...meta };
}

/**
 * צילום מסך לפי מיקומו בדיווח (מ-0).
 * @returns {Promise<{buffer:Buffer, filename:string, contentType:string}|null>}
 */
export async function loadReportImage(reportId, index, readFile) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return null;
  const doc = await AppReport.findOne({ reportId }).select('fileIds.images').lean();
  const ref = doc?.fileIds?.images?.[i];
  if (!ref?.gridfsId || !IMAGE_TYPES[ref.mimeType]) return null;
  return {
    buffer: await readFile(String(ref.gridfsId)),
    filename: `image-${i + 1}.${IMAGE_TYPES[ref.mimeType].ext}`,
    contentType: ref.mimeType,
  };
}

/**
 * צילום מסך לפי הטוקן הציבורי שלו, לקישור שמוטמע ב-issue.
 * @returns {Promise<{buffer:Buffer, contentType:string}|null>}
 */
export async function loadPublicImage(token, readFile) {
  if (typeof token !== 'string' || !IMAGE_TOKEN_RE.test(token)) return null;
  const doc = await AppReport.findOne({ 'fileIds.images.publicToken': token }).select('fileIds.images').lean();
  const ref = doc?.fileIds?.images?.find((img) => img.publicToken === token);
  if (!ref?.gridfsId || !IMAGE_TYPES[ref.mimeType]) return null;
  return { buffer: await readFile(String(ref.gridfsId)), contentType: ref.mimeType };
}

/**
 * @param {{reportId:string, subject:unknown, message:unknown, user:{id:string, name:string}}} input
 * @param {{sendContactMail:Function, config:object}} deps
 */
export async function contactReporter({ reportId, subject, message, user }, deps) {
  const s = typeof subject === 'string' ? subject.trim() : '';
  const m = typeof message === 'string' ? message.trim() : '';
  if (!s || s.length > 200) return { status: 422, body: { error: 'subject: 1..200 chars', field: 'subject' } };
  if (!m || m.length > 5000) return { status: 422, body: { error: 'message: 1..5000 chars', field: 'message' } };

  const doc = await AppReport.findOne({ reportId }).select('reportId product title reporterEmail replyToken').lean();
  if (!doc) return { status: 404, body: { error: 'Report not found' } };
  if (!doc.reporterEmail) return { status: 422, body: { error: 'Reporter left no email', field: 'reporterEmail' } };

  const replyDomain = deps.config?.replyDomain;
  const replyTo = replyDomain ? buildReplyAddress(doc.replyToken || await ensureReplyToken(reportId), replyDomain) : null;
  const result = await deps.sendContactMail({
    to: doc.reporterEmail, subject: s, message: m, reportTitle: doc.title, replyTo, product: productOf(doc),
  });
  if (!result?.sent) return { status: 502, body: { error: 'Failed to send email' } };

  const entry = { direction: 'out', byUserId: user.id || null, byName: user.name || '', subject: s, message: m, sentAt: deps.now || new Date() };
  await AppReport.updateOne({ reportId }, { $push: { contactLog: entry } });
  return { status: 200, body: { success: true, entry: { ...entry, byUserId: entry.byUserId ? String(entry.byUserId) : null } } };
}

/** הטוקן של כתובת המענה; נוצר פעם אחת לדיווח, גם כששתי פניות רצות במקביל. */
export async function ensureReplyToken(reportId) {
  const created = await AppReport.findOneAndUpdate(
    { reportId, replyToken: { $exists: false } },
    { $set: { replyToken: newReplyToken() } },
    { returnDocument: 'after' },
  ).select('replyToken').lean();
  if (created?.replyToken) return created.replyToken;
  const doc = await AppReport.findOne({ reportId }).select('replyToken').lean();
  return doc?.replyToken ?? null;
}

/**
 * תשובת מדווח שהגיעה מה-Email Worker. מחזיר {status, body}.
 * 404 = טוקן לא מוכר (ה-Worker מעביר אז את המייל לתיבה רגילה); כפילות לפי Message-ID מחזירה 200.
 * @param {unknown} raw
 * @param {{config:object, githubFor?:Function, fetchImpl?:Function, now?:Date}} deps
 */
export async function ingestInboundReply(raw, deps) {
  const v = validateInboundPayload(raw);
  if (!v.ok) return { status: 422, body: { error: v.error, field: v.field } };
  const { token, from, subject, messageId, text, html, headers, attachments } = v.value;

  const doc = await AppReport.findOne({ replyToken: token }).select('reportId reporterEmail issueNumber').lean();
  if (!doc) return { status: 404, body: { error: 'unknown_token' } };
  if (isAutoReply(headers)) return { status: 200, body: { ok: true, status: 'ignored_auto', reportId: doc.reportId } };

  const now = deps.now || new Date();
  // כתובת אחרת מזו שבדיווח: נשמר לצוות, אבל לא מתפרסם ב-issue הציבורי בלי בדיקה
  const fromReporter = Boolean(from && doc.reporterEmail && from === doc.reporterEmail.toLowerCase());
  const entry = {
    direction: 'in', byName: '', subject, message: inboundMessageBody({ text, html }), sentAt: now,
    fromEmail: from || null, messageId, attachments, issueComment: fromReporter ? 'pending' : 'held',
  };
  const filter = { reportId: doc.reportId, ...(messageId ? { 'contactLog.messageId': { $ne: messageId } } : {}) };
  const upd = await AppReport.updateOne(filter, { $push: { contactLog: entry }, $set: { lastInboundAt: now } });
  if (!upd.modifiedCount) return { status: 200, body: { ok: true, status: 'duplicate', reportId: doc.reportId } };

  if (fromReporter && doc.issueNumber) {
    // GitHub לא זמין? התשובה כבר שמורה, וה-cron יפרסם אותה
    await postInboundComments(doc.reportId, deps).catch((err) => console.error('Inbound reply comment failed:', err?.message));
  }
  return { status: 200, body: { ok: true, status: 'stored', reportId: doc.reportId } };
}

/** מפרסם ב-issue את התשובות הממתינות של דיווח אחד. כל תשובה נתפסת (posting) לפני הפרסום, כדי שלא תתפרסם פעמיים. */
export async function postInboundComments(reportId, deps) {
  const result = { posted: 0, errors: 0 };
  const doc = await AppReport.findOne({ reportId }).select('reportId product issueNumber contactLog').lean();
  if (!doc?.issueNumber) return result;
  const github = githubFor(deps, productOf(doc));
  if (!github) return result;
  for (const [i, c] of (doc.contactLog || []).entries()) {
    if (c.direction !== 'in' || c.issueComment !== 'pending') continue;
    const key = `contactLog.${i}`;
    const claimed = await AppReport.updateOne(
      { reportId, [`${key}.issueComment`]: 'pending' },
      { $set: { [`${key}.issueComment`]: 'posting' } },
    );
    if (!claimed.modifiedCount) continue;
    try {
      const { url } = await github.createComment(doc.issueNumber, buildInboundComment({ reportId, message: c.message, attachments: c.attachments }));
      await AppReport.updateOne({ reportId }, { $set: { [`${key}.issueComment`]: 'posted', [`${key}.issueCommentUrl`]: url } });
      result.posted += 1;
    } catch (err) {
      result.errors += 1;
      console.error(`App report ${reportId}: reply comment failed:`, err?.message);
      await AppReport.updateOne({ reportId }, { $set: { [`${key}.issueComment`]: 'pending' } });
    }
  }
  return result;
}

/** הסרה חלה על כל הדיווחים של אותה כתובת. */
export async function unsubscribeByToken(token, config) {
  const reportId = verifyUnsubscribeToken(token, config.unsubscribeSecret);
  if (!reportId) return { ok: false, reason: 'invalid_token' };
  const doc = await AppReport.findOne({ reportId }).select('reporterEmail').lean();
  if (!doc) return { ok: false, reason: 'not_found' };
  if (doc.reporterEmail) await AppReport.updateMany({ reporterEmail: doc.reporterEmail }, { $set: { unsubscribed: true } });
  else await AppReport.updateOne({ reportId }, { $set: { unsubscribed: true } });
  return { ok: true };
}

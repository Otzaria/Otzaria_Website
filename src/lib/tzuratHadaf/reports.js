// צורת הדף — סטטוס דיווח (מנהל או סנכרון מצורת הדף, PACKAGE.md §4): fixed ← +2 נקודות למדווח, פעם אחת
// (pointsAwarded מתהפך בעדכון מותנה, ורק אחריו $inc). ייבוא יחסי (node:test).

import mongoose from 'mongoose';
import TzuratReport from '../../models/TzuratReport.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import User from '../../models/User.js';
import { REPORT_STATUSES } from './reportRules.js';
import { isObj, isObjectId, cleanMultiline, cleanText, SLUG_RE, DAFKEY_RE } from './common.js';

export const POINTS_FIXED = 2;
export const MAX_SYNC = 5000;

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code) => ({ ok: false, status, error, ...(code ? { code } : {}) });

/** סטטוס חדש לדיווח ← {ok, report} */
export async function setReportStatus(reportId, { status, note = '', buildId = '' } = {}, admin = null, now = new Date()) {
  if (!isObjectId(String(reportId))) return fail(404, 'הדיווח לא נמצא');
  if (!REPORT_STATUSES.includes(status)) return fail(400, 'סטטוס לא מוכר');
  const resolution = {
    note: cleanMultiline(note, 1000),
    buildId: cleanText(buildId, 200),
    at: now,
    by: isObjectId(String(admin?.id)) ? oid(admin.id) : null,
  };
  const report = await TzuratReport.findOneAndUpdate(
    { _id: oid(reportId) },
    { $set: { status, ...(status === 'new' ? { resolution: null } : { resolution }) } },
    { returnDocument: 'after', lean: true }
  );
  if (!report) return fail(404, 'הדיווח לא נמצא');
  if (status === 'fixed') {
    const r = await TzuratReport.updateOne({ _id: report._id, status: 'fixed', pointsAwarded: { $ne: true } }, { $set: { pointsAwarded: true } });
    if (r.modifiedCount) await User.updateOne({ _id: report.user }, { $inc: { points: POINTS_FIXED } });
  }
  return { ok: true, report: await TzuratReport.findById(report._id).lean() };
}

/**
 * פתיחת עמוד לסבב נוסף מסנכרון: idempotent — אם העמוד כבר נפתח בסבב הזה מאותה בקשה (אותו buildId והערה)
 * ועדיין פתוח, לא נוגעים. עמוד עם הגשה שממתינה לאישור בסבב הנוכחי — לא נפתח (ההגשה הייתה מתייתמת); המנהל
 * מטפל בה קודם. ← {ok} או {error}
 */
async function reopenPage(p, now) {
  const page = await TzuratPage.findOne({ slug: p.slug, dafKey: p.dafKey }, { round: 1, status: 1, changedInRound: 1, reopen: 1 }).lean();
  if (!page) return { error: 'העמוד לא נמצא' };
  const note = cleanMultiline(p.note, 1000);
  const buildId = cleanText(p.buildId, 200);
  if (page.status === 'open' && page.changedInRound && page.reopen && page.reopen.note === note && page.reopen.buildId === buildId) return { ok: true };
  const round = page.round || 1;
  if (await TzuratSubmission.exists({ page: page._id, round, status: { $in: ['processing', 'submitted'] } })) {
    return { error: 'יש הגשה שממתינה לאישור בסבב הנוכחי — אשרו או דחו אותה, ואז סנכרנו שוב' };
  }
  const r = await TzuratPage.updateOne(
    { _id: page._id, round },
    {
      $set: {
        status: 'open',
        activeCount: 0,
        approvedCount: 0,
        submitters: [],
        changedInRound: true,
        leasedBy: null,
        leasedUntil: null,
        reopen: { note, buildId, at: now },
      },
      $inc: { round: 1 },
    }
  );
  return r.matchedCount ? { ok: true } : { error: 'העמוד השתנה בינתיים — סנכרנו שוב' };
}

/**
 * POST sync {reports:[{id, status, note, buildId}], pages:[{slug, dafKey, action:'reopen'|'close', note}]}
 * ← {ok, reports, pages, errors} (מונים של מה שעודכן)
 */
export async function applySync(body, admin = null, now = new Date()) {
  if (!isObj(body)) return fail(400, 'גוף הבקשה חסר');
  const reports = Array.isArray(body.reports) ? body.reports : [];
  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (reports.length + pages.length > MAX_SYNC) return fail(413, `עד ${MAX_SYNC} רשומות בסנכרון אחד`);
  const errors = [];
  let nReports = 0;
  let nPages = 0;
  for (const r of reports) {
    const res = await setReportStatus(r?.id, { status: r?.status, note: r?.note, buildId: r?.buildId }, admin, now);
    if (res.ok) nReports++;
    else if (errors.length < 20) errors.push(`דיווח ${String(r?.id).slice(0, 30)}: ${res.error}`);
  }
  for (const p of pages) {
    if (!isObj(p) || !SLUG_RE.test(String(p.slug)) || !DAFKEY_RE.test(String(p.dafKey))) {
      if (errors.length < 20) errors.push('עמוד לא תקין בסנכרון');
      continue;
    }
    let r;
    if (p.action === 'reopen') {
      const res = await reopenPage(p, now);
      if (res.error) {
        if (errors.length < 20) errors.push(`${p.slug} ${p.dafKey}: ${res.error}`);
        continue;
      }
      r = { matchedCount: 1 };
    } else if (p.action === 'close') {
      // כמו בפתיחה מחדש: עמוד עם הגשה שממתינה לאישור לא נסגר מתחתיה
      const page = await TzuratPage.findOne({ slug: p.slug, dafKey: p.dafKey }, { round: 1 }).lean();
      if (page && (await TzuratSubmission.exists({ page: page._id, round: page.round || 1, status: { $in: ['processing', 'submitted'] } }))) {
        if (errors.length < 20) errors.push(`${p.slug} ${p.dafKey}: יש הגשה שממתינה לאישור בסבב הנוכחי — אשרו או דחו אותה, ואז סנכרנו שוב`);
        continue;
      }
      r = await TzuratPage.updateOne({ slug: p.slug, dafKey: p.dafKey }, { $set: { status: 'closed', leasedBy: null, leasedUntil: null } });
    } else {
      if (errors.length < 20) errors.push(`${p.slug} ${p.dafKey}: פעולה לא מוכרת`);
      continue;
    }
    if (r.matchedCount) nPages++;
    else if (errors.length < 20) errors.push(`${p.slug} ${p.dafKey}: העמוד לא נמצא`);
  }
  return { ok: true, reports: nReports, pages: nPages, errors };
}

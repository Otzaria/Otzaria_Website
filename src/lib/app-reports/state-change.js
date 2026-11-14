/**
 * מעבר מצב של issue (מה-webhook, וה-cron כגיבוי): עדכון הדיווחים המקושרים
 * ומייל סגירה פעם אחת לכל מדווח. פתיחה מחדש מאפסת כדי שסגירה הבאה תשלח שוב.
 */
import AppReport from '../../models/AppReport.js';
import { buildUnsubscribeUrl } from './unsubscribe.js';
import { DEFAULT_PRODUCT, getProduct, productFilter } from './products.js';

export const CLOSURE_KINDS = Object.freeze(['completed', 'not_planned', 'duplicate', 'other']);

export function trustedIssueClosedAt(issue) {
  if (issue?.state !== 'closed' || typeof issue.closed_at !== 'string') return null;
  const seconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const milliseconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,3}Z$/;
  if (!seconds.test(issue.closed_at) && !milliseconds.test(issue.closed_at)) return null;
  const ms = Date.parse(issue.closed_at);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return date.toISOString().slice(0, 19) === issue.closed_at.slice(0, 19) ? date : null;
}

export function issueStateFields(issue, now) {
  if (issue.state === 'open') return {
    issueState: 'open', issueStateReason: null, issueClosedAt: null, issueCheckedAt: now,
    notifiedClosedAt: null, 'payloadCleanup.leaseToken': null, 'payloadCleanup.leaseUntil': null,
    'payloadCleanup.nextAttemptAt': null,
  };
  return {
    issueState: 'closed', issueStateReason: issue.state_reason ?? null,
    issueClosedAt: trustedIssueClosedAt(issue), issueCheckedAt: now,
  };
}

export function closureKind(stateReason) {
  return ['completed', 'not_planned', 'duplicate'].includes(stateReason) ? stateReason : 'other';
}

/** טקסט הסגירה במייל, לפי שם המוצר המוצג. */
export function closureText(kind, product = DEFAULT_PRODUCT) {
  switch (kind) {
    case 'completed': return `הבעיה שדיווחת עליה טופלה. התיקון ייכלל בגרסה הבאה של ${getProduct(product).displayName} (אם עוד לא נכלל).`;
    case 'not_planned': return 'הדיווח נבדק, והוחלט שלא לטפל בו בשלב זה.';
    case 'duplicate': return 'הדיווח נסגר כי הבעיה כבר מטופלת בדיווח אחר.';
    default: return 'הדיווח נסגר.';
  }
}

// הטקסטים של אוצריא (ברירת המחדל)
export const CLOSURE_TEXT_HE = Object.freeze(Object.fromEntries(CLOSURE_KINDS.map((k) => [k, closureText(k)])));

// "סגירה עם תגובה" ב-GitHub מפרסמת את התגובה רגע לפני הסגירה; נותנים מרווח למי שהגיב ואז סגר.
export const CLOSING_COMMENT_WINDOW_MS = 10 * 60 * 1000;
const CLOSING_COMMENT_SKEW_MS = 60 * 1000;
export const CLOSING_COMMENT_MAX_CHARS = 3000;

/**
 * התגובה שאיתה נסגר ה-issue: האחרונה של מי שסגר, בחלון שלפני הסגירה. טהור — נבדק ב-core.test.mjs.
 * @param {{body:string, author:string|null, created_at:string}[]} comments
 * @param {{closedAt:string|null, closedBy:string|null}} close
 * @returns {string|null}
 */
export function pickClosingComment(comments, { closedAt, closedBy }) {
  const closedMs = Date.parse(closedAt || '');
  if (!closedBy || !Number.isFinite(closedMs)) return null;
  let picked = null;
  for (const c of comments || []) {
    const at = Date.parse(c.created_at || '');
    if (c.author !== closedBy || !Number.isFinite(at)) continue;
    if (at < closedMs - CLOSING_COMMENT_WINDOW_MS || at > closedMs + CLOSING_COMMENT_SKEW_MS) continue;
    if (!picked || at >= picked.at) picked = { at, body: c.body };
  }
  if (!picked) return null;
  // הערות HTML (חתימות וסימונים פנימיים) לא מיועדות למדווח
  const text = String(picked.body || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!text) return null;
  return text.length > CLOSING_COMMENT_MAX_CHARS ? `${text.slice(0, CLOSING_COMMENT_MAX_CHARS).trimEnd()}…` : text;
}

/** שליפת תגובת הסגירה מ-GitHub; כשל לא יעצור את מייל הסגירה. */
async function fetchClosingComment(issue, github) {
  if (!github?.listComments || !issue.closed_at || !issue.closed_by) return null;
  try {
    const since = new Date(Date.parse(issue.closed_at) - CLOSING_COMMENT_WINDOW_MS).toISOString();
    const comments = await github.listComments(issue.number, since);
    return pickClosingComment(comments, { closedAt: issue.closed_at, closedBy: issue.closed_by });
  } catch (err) {
    console.error(`App reports: closing comment of issue #${issue.number} failed:`, err?.message);
    return null;
  }
}

/**
 * מי מקבל מייל: יש מייל, לא הסיר את עצמו, וטרם קיבל הודעה על הסגירה הזו. מייל אחד לכל כתובת.
 * @returns {{email:string, reports:object[]}[]}
 */
export function planClosureNotifications(reports) {
  const byEmail = new Map();
  for (const r of reports) {
    if (!r.reporterEmail || r.unsubscribed || r.notifiedClosedAt) continue;
    const key = r.reporterEmail.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { email: key, reports: [] });
    byEmail.get(key).reports.push(r);
  }
  return [...byEmail.values()];
}

/**
 * @param {{number:number, state:string, state_reason?:string|null, url?:string, closed_at?:string|null, closed_by?:string|null}} issue
 * @param {{sendClosedMail:Function, config:object, product?:string, now?:Date, Model?:object, github?:object}} deps
 *   product — המוצר שה-issue בריפו שלו; אותו מספר בריפו אחר שייך לדיווחים אחרים.
 *   github — לקוח הריפו, לשליפת התגובה שאיתה נסגר ה-issue (נשלפת רק כשיש למי לשלוח).
 * @returns {Promise<{transition:string, notified:number, failed:number}>}
 */
export async function handleIssueStateChange(issue, deps) {
  const Model = deps.Model || AppReport;
  const now = deps.now || new Date();
  const product = deps.product || DEFAULT_PRODUCT;
  const filter = { ...productFilter(product), issueNumber: issue.number };

  if (issue.state !== 'open' && issue.state !== 'closed') {
    throw new Error('GitHub returned an unknown issue state');
  }
  await Model.updateMany(filter, { $set: issueStateFields(issue, now), $inc: { issueStateRevision: 1 } });

  if (issue.state !== 'closed') {
    return { transition: 'open', notified: 0, failed: 0 };
  }

  const reason = issue.state_reason ?? null;
  const reports = await Model.find({ ...filter, notifiedClosedAt: null, unsubscribed: { $ne: true }, reporterEmail: { $nin: [null, ''] } })
    .select('_id reportId title reporterEmail unsubscribed notifiedClosedAt issueUrl')
    .sort({ createdAt: 1 })
    .lean();

  let notified = 0;
  let failed = 0;
  const groups = planClosureNotifications(reports);
  const closingComment = groups.length ? await fetchClosingComment(issue, deps.github) : null;
  for (const group of groups) {
    const ids = group.reports.map((r) => r._id);
    // תפיסה אטומית לפני השליחה: ריצה מקבילה לא תשלח שוב
    const claim = await Model.updateMany({ _id: { $in: ids }, notifiedClosedAt: null }, { $set: { notifiedClosedAt: now } });
    if (!claim.modifiedCount) continue;

    const first = group.reports[0];
    const kind = closureKind(reason);
    let result;
    try {
      result = await deps.sendClosedMail({
        to: group.email,
        product,
        reportTitle: first.title,
        issueNumber: issue.number,
        issueUrl: issue.url || first.issueUrl || null,
        reasonKind: kind,
        reasonText: closureText(kind, product),
        closingComment,
        unsubscribeUrl: deps.config?.unsubscribeSecret
          ? buildUnsubscribeUrl(deps.config.siteUrl, first.reportId, deps.config.unsubscribeSecret)
          : null,
      });
    } catch (err) {
      result = { sent: false, error: err?.message };
    }
    if (result?.sent) {
      notified += 1;
    } else {
      failed += 1;
      await Model.updateMany({ _id: { $in: ids }, notifiedClosedAt: now }, { $set: { notifiedClosedAt: null } });
    }
  }
  return { transition: 'closed', notified, failed };
}

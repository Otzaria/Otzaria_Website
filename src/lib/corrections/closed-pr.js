/**
 * דיווח שה-PR שלו נסגר בלי מיזוג: קריאת הקובץ מ-main (קריאה בלבד), עיגון שורת היעד לבסיס, והמעבר
 * המותנה שנגזר מהתוצאה (הכלל עצמו — absorption.js). משמש את מעקב ה-PR ב-worker ואת ה-migration.
 */
import ErrorReport from '../../models/ErrorReport.js';
import ChangePackage from '../../models/ChangePackage.js';
import { createRepoClient } from '../dicta/github-api.js';
import { createGitSource } from './git-source.js';
import { ByteLru } from './lru.js';
import { splitSourceLines } from './source-text.js';
import { resolveSource } from './resolver.js';
import { computeNewLine } from './payload.js';
import { sanitizePublicText } from './publisher.js';
import {
  ABSORPTION, CLOSED_PR_ACTION, PR_CLOSED_HANDOFF, baseNeighbors, evaluateAbsorption, handoffReasonOf, absorptionDeadline,
  expiredAction, closedPrAction, hasRejectedLabel,
} from './absorption.js';
import { currentRevisionOf, logEvent, manualQueueSet } from './store.js';

// גרסת הכלל: תוצאה שמורה מגרסה אחרת אינה ממוחזרת (publish.absorptionCheck.v).
// 6: כל "נקלט" מותנה באיתור הפסקה המדווחת ובמצב העריכה בה (locate-edit.js).
// 7: וגם חתימות הטעות אינן בשום מקום בזרם האסימונים של הקובץ, מעבר לגבולות שורות (מקור שזז ופוצל/אוחד/הורחב).
export const ABSORPTION_RULE_VERSION = 7;
// שורות מהבסיס לכל צד כשהבסיס נקרא מקובץ (ולא מההקשר שנשמר באישור).
const BASE_SPAN = 12;
const COMMENT_MAX = 500;
const noBom = (s) => (String(s ?? '').startsWith('﻿') ? String(s).slice(1) : String(s ?? ''));
const linesOf = (content) => splitSourceLines(content).lines.map((l) => l.text);
// הערכת הנפח של עותק בסיס מפורק במטמון: השורות, ועליהן האינדקס של locate-edit.js (נרמול, אסימונים ומפות).
const parsedBytes = (lines) => (lines ? lines.reduce((n, l) => n + l.length, 0) * 8 + lines.length * 96 : 64);

let absorptionCache = null;
function cacheFor(bytes) {
  if (!absorptionCache || absorptionCache.maxBytes !== bytes) absorptionCache = new ByteLru(bytes);
  return absorptionCache;
}

/** גרסת ההצעה שאושרה (ואם אינה ידועה — הנוכחית). */
function approvedRevisionOf(r) {
  const n = r.approval?.revision;
  return (Number.isSafeInteger(n) && r.proposals?.find((p) => p.revision === n)) || currentRevisionOf(r);
}

/** ההקשר שנשמר באישור (resolvedSource.context) — רק כשהוא של אותו blob, נתיב ושורה כמו החבילה. */
function contextBase(rs, pkg) {
  const ctx = rs?.context;
  if (!ctx || !Array.isArray(ctx.before) || !Array.isArray(ctx.after)) return null;
  if (rs.blobSha !== pkg.baseBlobSha || rs.lineIndex !== pkg.lineIndex || rs.path !== pkg.path) return null;
  return { before: ctx.before, after: ctx.after };
}

/** הבסיס מתוך הקובץ המלא — רק כששורת היעד בו היא אכן השורה המקורית. */
function baseFromLines(texts, lineIndex, originalLine) {
  if (!texts || !(lineIndex >= 0 && lineIndex < texts.length) || noBom(texts[lineIndex]) !== noBom(originalLine)) return null;
  return { before: texts.slice(Math.max(0, lineIndex - BASE_SPAN), lineIndex), after: texts.slice(lineIndex + 1, lineIndex + 1 + BASE_SPAN) };
}

const knownNeighbors = (base) => {
  const nb = baseNeighbors(base);
  return nb ? nb.before.length + nb.after.length : 0;
};

/**
 * השינוי שה-PR נשא: מחבילת השינוי (עם הבסיס מההקשר שנשמר באישור), ואם אין חבילה (דיווחים שאושרו
 * בכמות מחוץ ל-worker) — מההצעה שאושרה, בנתיב שה-resolver מאתר באותו קומיט של main.
 * @returns {Promise<object>} {path, lineIndex, originalLine, newLine, from, changeId, base, baseBlobSha?, prCommitSha?} או {error}
 */
export async function closedPrChange(report, { gitSource, head, source, packages }) {
  const changeId = report.publish?.changeId;
  if (changeId) {
    const pkg = packages ? packages.get(changeId) : await ChangePackage.findOne({ changeId }).lean();
    if (pkg) {
      return {
        path: pkg.path, lineIndex: pkg.lineIndex, originalLine: pkg.originalLine, newLine: pkg.newLine, from: 'package', changeId,
        base: contextBase(report.resolvedSource, pkg), baseBlobSha: pkg.baseBlobSha,
      };
    }
  }
  const rev = approvedRevisionOf(report);
  const newLine = computeNewLine(rev);
  if (!rev || newLine === null) return { error: 'no_proposal' };
  const override = rev.targetPath ? { path: rev.targetPath, lineIndex: rev.targetLineIndex, expectedLine: rev.originalLine } : null;
  const pinned = { ...gitSource, getHead: async () => head };
  const found = await resolveSource({ report, revision: rev, gitSource: pinned, source, override });
  if (!found.path) return { error: found.reason || found.status };
  return {
    path: found.path, lineIndex: override ? override.lineIndex : report.location?.lineIndex ?? null,
    originalLine: override ? override.expectedLine : rev.originalLine, newLine, from: 'proposal', changeId: null,
    base: null, prCommitSha: report.publish?.commitSha || null,
  };
}

/**
 * בודק מול קומיט אחד של main (הראש נקרא פעם אחת לבודק — אצווה או הרצת migration). כל קובץ נקרא
 * ומפורק פעם אחת לבודק; מטמון נפרד, כך שקבצים ענקיים לא דוחקים את מטמון התצוגה והפרסום.
 * @param {{config:object, deps?:object}} opts
 */
export function createAbsorptionChecker({ config, deps = {} }) {
  const client = createRepoClient({ repo: config.source.repo, token: config.source.token || null, fetchImpl: deps.githubFetch || fetch });
  const cache = cacheFor(config.publish.absorptionCacheBytes);
  const git = createGitSource({ client, ref: config.source.ref, cache });
  const relocationLines = config.publish.absorptionRelocationLines;
  let headPromise = null;
  // כשל בקריאת הראש אינו נשמר: הקריאה הבאה מנסה שוב.
  const head = () => (headPromise ??= git.getHead().catch((err) => {
    headPromise = null;
    throw err;
  }));
  const memo = new Map();
  const once = (key, fn) => {
    if (!memo.has(key)) memo.set(key, fn().catch((err) => { memo.delete(key); throw err; }));
    return memo.get(key);
  };
  const parsed = (f) => (f ? { blobSha: f.blobSha, lossy: f.lossy, texts: f.lossy ? [] : linesOf(f.content) } : null);
  const file = async (path) => {
    const { commitSha } = await head();
    return once(`file:${commitSha}:${path}`, async () => parsed(await git.getFile(path, commitSha)));
  };
  /** ה-sha של הקובץ ב-main בלי להוריד אותו (רשימת התיקייה בלבד). */
  const fileSha = async (path) => {
    const { commitSha } = await head();
    const cut = path.lastIndexOf('/');
    const entries = await git.listDir(path.slice(0, cut), commitSha);
    let sha = entries?.find((e) => e.name === path.slice(cut + 1) && e.type === 'file')?.sha || null;
    if (!sha && entries && entries.length >= 1000) sha = (await client.getFileMeta(path, commitSha))?.sha || null;
    return sha;
  };
  // עותקי הבסיס המפורקים (ועליהם האינדקס של locate-edit.js, שנבנה פעם אחת לכל מערך שורות) — במטמון המוגבל
  // בנפח, לא במפה שגדלה עד סוף ההרצה (migration על הרבה גרסאות בסיס). בקשה זהה בזמן טעינה ממתינה לאותה הבטחה.
  const loading = new Map();
  const bounded = (key, fn) => {
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit.lines);
    if (!loading.has(key)) {
      loading.set(key, fn().then((lines) => {
        cache.set(key, { lines }, parsedBytes(lines));
        return lines;
      }).finally(() => loading.delete(key)));
    }
    return loading.get(key);
  };
  const blobLines = (sha) => bounded(`base-lines:${sha}`, async () => {
    const b = await git.loadBlob(sha);
    return b.lossy ? null : linesOf(b.content);
  });
  const parentLines = (commitSha, path) => bounded(`parent-lines:${commitSha}:${path}`, async () => {
    const parent = (await client.getCommit(commitSha)).parents?.[0];
    const f = parent ? await git.getFile(path, parent) : null;
    return f && !f.lossy ? linesOf(f.content) : null;
  });
  /** הקובץ המלא בבסיס: ה-blob מהחבילה, או (דיווח בלי חבילה) הקובץ בהורה של קומיט ה-PR. null כשאינו תואם. */
  const baseLinesFor = async (found) => {
    const lines = found.baseBlobSha ? await blobLines(found.baseBlobSha) : found.prCommitSha ? await parentLines(found.prCommitSha, found.path) : null;
    return baseFromLines(lines, found.lineIndex, found.originalLine) ? lines : null;
  };
  /** שכני שורת היעד בבסיס: מההקשר שנשמר באישור, ואם הוא חלש — מהקובץ המלא בבסיס. */
  const baseFor = async (found) => {
    if (knownNeighbors(found.base) >= 2) return found.base;
    return baseFromLines(await baseLinesFor(found), found.lineIndex, found.originalLine) ?? found.base ?? null;
  };
  const change = async (report, packages) => closedPrChange(report, { gitSource: git, head: await head(), source: config.source, packages });
  /**
   * התוצאה לשינוי שכבר אותר. כשהתוצאה תלויה בראיה חדשה ("נקלט" או הזזה) נקרא גם הקובץ המלא בבסיס —
   * כדי שמופע שהיה שם קודם לא ייחשב ראיה. כשל בקריאת הבסיס אינו מכשיל: כל "נקלט" בלי הבסיס
   * (גם מעוגן — העיגון לבדו אינו ראיה, עותק כפול) הופך ל-changed (base_required) וממתין; התוצאה אינה נשמרת למחזור.
   */
  const evaluate = async (found, f) => {
    let base = found.base ?? null;
    let baseError = false;
    try {
      base = await baseFor(found);
    } catch {
      baseError = true;
    }
    let v = evaluateAbsorption(f, { ...found, base }, { relocationLines, requireBase: true });
    // הקובץ המלא בבסיס נדרש לראיה חדשה: לכל "נקלט" (מעוגן או לא) ולהזזה בלי עיגון.
    // בלי הבסיס (לא נקרא, לא תואם או כשל) כל "נקלט" הופך ל-changed (base_required) וממתין — לעולם לא נסגר.
    const needsBase = v.outcome === ABSORPTION.ABSORBED || v.detail === 'relocated_unanchored' || v.detail === 'base_required';
    if (needsBase && !baseError) {
      try {
        const baseLines = await baseLinesFor(found);
        if (baseLines) v = evaluateAbsorption(f, { ...found, base: baseFromLines(baseLines, found.lineIndex, found.originalLine) ?? base, baseLines }, { relocationLines, requireBase: true });
      } catch {
        baseError = true;
      }
    }
    const { commitSha } = await head();
    return { ...v, path: found.path, from: found.from, changeId: found.changeId ?? null, mainSha: commitSha, blobSha: f?.blobSha ?? null, baseError };
  };
  const unresolved = async (found) => ({
    outcome: ABSORPTION.CHANGED, detail: found.error, lineIndex: null, relocated: false, anchored: false, path: null, mainSha: (await head()).commitSha, blobSha: null,
  });
  return {
    client,
    head,
    change,
    file,
    /** שחרור קובץ שכבר נבדק (migration: הרצה ארוכה על מאות קבצים, חלקם עשרות MB). */
    forget: async (path) => memo.delete(`file:${(await head()).commitSha}:${path}`),
    evaluate,
    unresolved,
    /**
     * בדיקה לדיווח. כש-main לא זז מאז הבדיקה הקודמת, או שהקובץ עצמו לא השתנה — התוצאה הקודמת
     * (מאותה גרסת כלל ואותה חבילה) נשארת, בלי להוריד את הקובץ שוב.
     */
    async check(report, packages) {
      const prev = report.publish?.absorptionCheck;
      const { commitSha } = await head();
      const reusable = prev && prev.v === ABSORPTION_RULE_VERSION && !prev.baseError && (prev.changeId ?? null) === (report.publish?.changeId ?? null);
      if (reusable && prev.mainSha === commitSha) return { ...prev, reused: 'main' };
      const found = await change(report, packages);
      if (found.error) return unresolved(found);
      if (reusable && prev.blobSha && prev.path === found.path && (await fileSha(found.path)) === prev.blobSha) return { ...prev, mainSha: commitSha, reused: 'file' };
      return evaluate(found, await file(found.path));
    },
  };
}

/** הערת הסגירה של מנהל הספרייה: ההערה האחרונה עד רגע הסגירה, מקוצרת ובלי פרטי קשר. best-effort. */
export async function fetchCloseComment(client, pr) {
  try {
    const list = await client.listIssueComments(pr.number);
    const until = pr.closedAt ? new Date(pr.closedAt).getTime() + 60_000 : Infinity;
    const last = list.filter((c) => !c.createdAt || new Date(c.createdAt).getTime() <= until).at(-1);
    const body = last ? sanitizePublicText(last.body, COMMENT_MAX) : '';
    return body ? { body, at: last.createdAt ? new Date(last.createdAt) : null } : null;
  } catch {
    return null;
  }
}

// הדיווח יוצא מהתור הידני (המעקב הישן העביר אותו לשם) וממתין לקליטה ב-main.
const UNQUEUE_SET = {
  'manual.status': 'none', 'manual.handoffReason': null, 'manual.queuedAt': null, 'manual.assignee': null, 'manual.assigneeName': null,
  'manual.claimedAt': null, 'manual.leaseExpiresAt': null, status: 'pending', assignedTo: null,
};
// סגירה של דיווח שהיה בתור הידני: בלי שאריות של שיוך ותור.
const CLEAR_MANUAL = {
  'manual.handoffReason': null, 'manual.queuedAt': null, 'manual.assignee': null, 'manual.assigneeName': null,
  'manual.claimedAt': null, 'manual.leaseExpiresAt': null, assignedTo: null,
};

const pickFields = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? null]));
/** המצב שלפני מעבר של migration — לביטול (revertClosedPullMigration). בלי שמות ופרטי קשר. */
export function beforeSnapshot(r) {
  return {
    state: r.state, status: r.status ?? null, closedAt: r.closedAt ?? null, resolvedAt: r.resolvedAt ?? null, closeReason: r.closeReason ?? null,
    publish: pickFields(r.publish, ['status', 'lastError', 'conflictReason', 'updatedAt']),
    manual: pickFields(r.manual, ['status', 'handoffReason', 'queuedAt']),
    inclusion: pickFields(r.inclusion, ['status', 'at']),
  };
}

// at: מתי התוכן נבדק בפועל (תוצאה ממוחזרת שומרת את המועד המקורי; mainSha מתעדכן לראש הנוכחי).
const checkSnapshot = (v, now) => ({
  v: ABSORPTION_RULE_VERSION, at: v.at ?? now, mainSha: v.mainSha ?? null, blobSha: v.blobSha ?? null, path: v.path ?? null, changeId: v.changeId ?? null,
  outcome: v.outcome, detail: v.detail, lineIndex: v.lineIndex ?? null, anchored: Boolean(v.anchored), baseError: Boolean(v.baseError),
});

/**
 * מחיל את המעבר בעדכון אטומי יחיד, מותנה ב-generation, במצב הפרסום ובמספר ה-PR שנקראו; בזיהוי הסגירה
 * הראשון גם בכך ש-prClosedAt עדיין ריק (שתי אצוות מקבילות — רק אחת רושמת).
 * המקור: 'pr_opened' (מעקב ה-PR), או 'failed' — דיווח שמעקב ה-PR הישן כבר העביר לידני (migration).
 * @param {object} r הדיווח כפי שנקרא
 * @param {string} action CLOSED_PR_ACTION
 * @param {object|null} verdict תוצאת הבדיקה (null — לא נבדק: תווית דחייה, תקלה או תום המתנה)
 * @param {{now:Date, closedAt:Date, graceSeconds:number, actor:object, filter?:object, data?:object, comment?:object|null}} opts
 * @returns {Promise<'closed'|'awaiting'|'handoff'|'unchanged'|'raced'>}
 */
export async function applyClosedPrAction(r, action, verdict, { now, closedAt, graceSeconds, actor, filter = {}, data = {}, comment = null }) {
  const queued = r.publish?.status === 'failed';
  const first = !queued && !r.publish?.prClosedAt;
  const where = {
    _id: r._id, state: 'open', workflowGeneration: r.workflowGeneration, 'publish.status': r.publish?.status, 'publish.prNumber': r.publish?.prNumber,
    ...(first ? { 'publish.prClosedAt': null } : {}), ...filter,
  };
  const deadline = absorptionDeadline(closedAt, graceSeconds);
  const common = {
    'publish.prClosedAt': closedAt, 'publish.absorptionDeadline': deadline, 'publish.updatedAt': now,
    ...(verdict?.mainSha ? { 'publish.absorptionCheck': checkSnapshot(verdict, now) } : {}),
    ...(comment && !r.publish?.prCloseComment ? { 'publish.prCloseComment': comment } : {}),
  };
  const eventData = {
    prNumber: r.publish?.prNumber ?? null, mainSha: verdict?.mainSha ?? null, path: verdict?.path ?? null, lineIndex: verdict?.lineIndex ?? null,
    detail: verdict?.detail ?? null, anchored: verdict ? Boolean(verdict.anchored) : null, ...(comment ? { comment: comment.body.slice(0, 200) } : {}),
    ...(data.migration ? { before: beforeSnapshot(r), fromGeneration: r.workflowGeneration } : {}), ...data,
  };
  let update;
  let event;
  let result;
  if (action === CLOSED_PR_ACTION.CLOSE_ABSORBED) {
    update = {
      $set: {
        ...common, state: 'closed_published', status: 'resolved', closedAt: now, resolvedAt: now, closeReason: 'pr_absorbed', 'manual.status': 'none',
        ...(queued ? CLEAR_MANUAL : {}), 'dispatch.publish': false, 'publish.status': 'committed', 'publish.absorbed': true,
        'publish.lastError': null, 'publish.conflictReason': null, 'inclusion.status': 'merged_to_main', 'inclusion.at': now,
      },
      $inc: { workflowGeneration: 1 },
    };
    [event, result] = ['pr_absorbed', 'closed'];
    eventData.relocated = Boolean(verdict?.relocated);
  } else if (action === CLOSED_PR_ACTION.AWAIT) {
    // בלי בדיקה מוצלחת (תקלה) — שגיאת המעקב נשארת גלויה.
    const set = { ...common, ...(verdict ? { 'publish.lastError': null } : {}) };
    update = queued
      ? { $set: { ...set, ...UNQUEUE_SET, 'publish.status': 'pr_opened' }, $inc: { workflowGeneration: 1 } }
      : { $set: set };
    // ביומן רק כשההמתנה מתחילה; בדיקות חוזרות בזמן ההמתנה אינן אירוע.
    [event, result] = [queued || first ? 'pr_closed_awaiting_absorption' : null, 'awaiting'];
    eventData.deadline = deadline;
  } else {
    const reason = handoffReasonOf(action);
    if (queued && r.manual?.handoffReason === reason) return 'unchanged';
    const set = {
      ...common, 'publish.status': 'failed', 'publish.lastError': 'pr_closed_unmerged',
      'publish.conflictReason': reason === PR_CLOSED_HANDOFF.CHANGED ? reason : null,
    };
    // כבר בתור הידני: רק הסיבה מתעדכנת (אין עבודה ישנה לפסול); אחרת — העברה לידני רגילה.
    update = queued
      ? { $set: { ...set, 'manual.handoffReason': reason } }
      : { $set: { ...set, ...manualQueueSet(reason, now) }, $inc: { workflowGeneration: 1 } };
    [event, result] = ['pr_closed_unmerged', 'handoff'];
    eventData.reason = reason;
  }
  const updated = await ErrorReport.findOneAndUpdate(where, update, { returnDocument: 'after' }).lean();
  if (!updated) return 'raced';
  if (event) await logEvent(r._id, event, actor, updated.workflowGeneration, eventData);
  return result;
}

/** תום ההמתנה בלי בדיקה חדשה (תקלה קבועה, פרסום כבוי): לידני לפי התוצאה האחרונה שנבדקה. */
export async function expireAwaiting(r, { now, config, actor }) {
  const last = r.publish?.absorptionCheck;
  const action = expiredAction(last?.outcome);
  return applyClosedPrAction(r, action, null, {
    now, closedAt: r.publish.prClosedAt, graceSeconds: config.publish.absorptionGraceSeconds, actor,
    data: { expired: true, lastOutcome: last?.outcome ?? null, detail: last?.detail ?? 'unverified' },
  });
}

/**
 * PR סגור שבדיקתו נכשלה (blob ענק שחורג מה-timeout, PR שנמחק, תקלת רשת): השעון מתחיל בכל זאת, ובתומו
 * הדיווח עובר לידני — תקלה קבועה לעולם לא משאירה אותו מחוץ לתור.
 */
export async function onClosedPullError(r, { now, config, actor }) {
  const graceSeconds = config.publish.absorptionGraceSeconds;
  if (!r.publish?.prClosedAt) return applyClosedPrAction(r, CLOSED_PR_ACTION.AWAIT, null, { now, closedAt: now, graceSeconds, actor, data: { checkFailed: true } });
  if (now < absorptionDeadline(r.publish.prClosedAt, graceSeconds)) return null;
  return expireAwaiting(r, { now, config, actor });
}

/** פרסום כבוי (אין פנייה ל-GitHub): דיווחים שתמה המתנתם עוברים לידני בכל זאת. */
export async function expireAwaitingReports({ config, now, actor, limit = 50 }) {
  const cutoff = new Date(now.getTime() - config.publish.absorptionGraceSeconds * 1000);
  const reports = await ErrorReport.find({ state: 'open', 'publish.status': 'pr_opened', 'publish.prClosedAt': { $ne: null, $lte: cutoff } }).limit(limit).lean();
  let moved = 0;
  for (const r of reports) if ((await expireAwaiting(r, { now, config, actor })) === 'handoff') moved += 1;
  return moved;
}

/**
 * PR שנסגר בלי מיזוג (מעקב ה-PR): תווית דחייה → ידני מיד; אחרת בדיקת התוכן ב-main והמעבר שנגזר ממנה.
 * בזיהוי הסגירה הראשון נשמרת גם הערת הסגירה של מנהל הספרייה (להצגה בלבד — לעולם לא מנותחת).
 * @param {{checker:object, client:object, config:object, now:Date, actor:object, comments:Map}} ctx
 * @returns {Promise<boolean>} האם המצב השתנה
 */
export async function processClosedPull(r, pr, { checker, client, config, now, actor, comments }) {
  const first = !r.publish?.prClosedAt;
  const closedAt = r.publish?.prClosedAt || now;
  const graceSeconds = config.publish.absorptionGraceSeconds;
  const rejected = hasRejectedLabel(pr.labels, config.publish.rejectedLabels);
  let comment = null;
  if (first && !r.publish?.prCloseComment && !pr.missing) {
    if (!comments.has(pr.number)) comments.set(pr.number, fetchCloseComment(client, pr));
    comment = await comments.get(pr.number);
  }
  const verdict = rejected ? null : await checker.check(r);
  const action = rejected ? CLOSED_PR_ACTION.HANDOFF_REJECTED : closedPrAction(verdict, { closedAt, now, graceSeconds });
  const res = await applyClosedPrAction(r, action, verdict, { now, closedAt, graceSeconds, actor, comment, data: rejected ? { labels: pr.labels } : {} });
  return res === 'closed' || res === 'handoff' || (res === 'awaiting' && first);
}

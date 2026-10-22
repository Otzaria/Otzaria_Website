// ניקוי שעתי של קבצי עבודות OCR מקומי (שלב 9) — נקרא מ-/api/cron/ocr-local-cleanup.
// מפרט סעיף 4 ("ניקוי") וסעיף 6: 24 שעות ממועד אישור המסירה (ackAt) נמחקים קובצי הקלט/התוצאה/
// ההעברה; ללא ack — תוצאה לא נמחקת; תוצאה מתנגשת שטרם נבדקה — לא נמחקת. המדיניות לכל קובץ:
// localCleanup.pure.js.
//
// - רק קבצים: רשומות OcrJob/OcrConflict וה-ack לא נמחקים ולא משתנים (בלי TTL). נרשמים רק
//   filesCheckedAt / filesPurgedAt (התיקייה ריקה ונמחקה) / inputPurgedAt / resultPurgedAt —
//   בלי לשנות updatedAt (timestamps:false), כדי שלא לסרוק שוב בכל הרצה.
// - מחיקה רק בתוך שורש האחסון: תיקיית העבודה נגזרת מ-jobDir (24 hex, נבדק מול השורש), שמות
//   הקבצים חייבים להתאים לתבנית <kind>-<sha256>.<ext>, ורק קבצים רגילים (לא קישורים/תיקיות);
//   תיקיית עבודה שהיא עצמה קישור (symlink/junction) — לא נוגעים בה כלל.
// - אידמפוטנטי וחסום: עד limit עבודות ועד maxMs להרצה; קובץ/תיקייה חסרים אינם שגיאה; כשל בעבודה
//   אחת לא עוצר את האחרות (נרשם ב-errors ונבדק שוב אחרי RECHECK_MS).
// - שורש האחסון חסר (דיסק לא מחובר / תצורה שגויה) — לא נוגעים בכלום ולא מסמנים "נוקה".
//
// imports יחסיים בלבד (נבדק ב-node:test).
import fs from 'node:fs/promises';
import path from 'node:path';
import OcrJob from '../../models/OcrJob.js';
import { jobDir, storageRoot, sweepTmpFiles } from './localStorage.js';
import { resumeStalledApplies } from './localApply.js';
import {
  cleanupCandidateFilter,
  fileDecision,
  FILE_RETENTION_MS,
  jobFilesEligibility,
  parseJobFileName,
} from './localCleanup.pure.js';

export const CLEANUP_JOB_LIMIT = 200;
export const CLEANUP_MAX_MS = 60 * 1000;
export const RESUME_LIMIT = 20;
const MAX_ERROR_SAMPLES = 20;
// השדות שההחלטות צריכות — בלי pageMap (עד אלפיים איברים לעבודה)
const CANDIDATE_FIELDS =
  '_id method active status ack ackAt finishedAt cancelledAt updatedAt resultSha256 resultPath inputPath ' +
  'inputPurgedAt resultPurgedAt filesPurgedAt filesCheckedAt resultConflicts resultRejections';

const hasAck = (job) => typeof job?.ack?.ack === 'string';
const ignorable = (e) => e?.code === 'ENOENT';

async function storageAvailable(env) {
  try {
    return (await fs.stat(/*turbopackIgnore: true*/ storageRoot(env))).isDirectory();
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') return false;
    throw e;
  }
}

// תיקיית העבודה חייבת להיות תיקייה אמיתית: קישור (symlink/junction) בשם <jobId> היה גורם ל-readdir
// ול-unlink לפעול על תיקייה מחוץ לשורש האחסון — לא נוגעים בה כלל (נרשם כשגיאה, לא מסומן "נוקה")
export class JobDirNotDirectoryError extends Error {
  constructor() {
    super('job directory is not a plain directory');
    this.name = 'JobDirNotDirectoryError';
    this.code = 'job_dir_not_directory';
  }
}

async function listDir(dir) {
  try {
    const st = await fs.lstat(/*turbopackIgnore: true*/ dir);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new JobDirNotDirectoryError();
    return await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') return null;
    throw e;
  }
}

/**
 * ניקוי תיקיית עבודה אחת (job — lean, עם השדות של CANDIDATE_FIELDS).
 * @returns {Promise<{eligible:boolean, deleted:{input:number,result:number,rejected:number}, kept:number,
 *   dirRemoved:boolean, errors:{jobId:string, code:string}[]}>}
 */
export async function purgeJobFiles(job, { now = new Date(), env = process.env, retentionMs = FILE_RETENTION_MS } = {}) {
  const jobId = String(job._id);
  const out = { eligible: false, deleted: { input: 0, result: 0, rejected: 0 }, kept: 0, dirRemoved: false, errors: [] };
  if (!jobFilesEligibility(job, now, retentionMs)) return out;
  out.eligible = true;

  const dir = jobDir(jobId, env);
  const entries = await listDir(dir);
  let inputLeft = false;
  let lockedResultLeft = false;
  let anyLeft = false;

  for (const entry of entries ?? []) {
    const abs = path.join(/*turbopackIgnore: true*/ dir, entry.name);
    const parsed = parseJobFileName(entry.name);
    if (!entry.isFile() || !parsed) {
      anyLeft = true; // תיקייה/קישור/שם לא מוכר/קובץ זמני — לא נוגעים
      continue;
    }
    const decision = fileDecision({ name: entry.name }, job, now);
    if (decision.action === 'delete') {
      try {
        await fs.unlink(/*turbopackIgnore: true*/ abs);
        out.deleted[parsed.kind]++;
        continue;
      } catch (e) {
        if (ignorable(e)) continue;
        out.errors.push({ jobId, code: String(e?.code ?? 'delete_failed') });
      }
    } else {
      out.kept++;
    }
    anyLeft = true;
    if (parsed.kind === 'input') inputLeft = true;
    if (parsed.kind === 'result' && parsed.sha === job.resultSha256) lockedResultLeft = true;
  }

  // תיקייה שהתרוקנה — נמחקת (rmdir נכשל בשקט אם נכתב לתוכה משהו בינתיים)
  if (entries === null) {
    out.dirRemoved = true;
  } else if (!anyLeft) {
    try {
      await fs.rmdir(/*turbopackIgnore: true*/ dir);
      out.dirRemoved = true;
    } catch (e) {
      if (ignorable(e)) out.dirRemoved = true;
      else if (e?.code !== 'ENOTEMPTY' && e?.code !== 'EEXIST') out.errors.push({ jobId, code: String(e?.code ?? 'rmdir_failed') });
    }
  }

  const set = { filesCheckedAt: now, filesPurgedAt: out.dirRemoved ? now : null };
  if (job.inputPath && !job.inputPurgedAt && !inputLeft) set.inputPurgedAt = now;
  if (job.resultPath && hasAck(job) && !job.resultPurgedAt && !lockedResultLeft) set.resultPurgedAt = now;
  await OcrJob.updateOne({ _id: job._id, method: 'local', active: false }, { $set: set }, { timestamps: false });
  return out;
}

/**
 * ניקוי כל העבודות הכשירות (עד limit, עד maxMs) + קבצים זמניים יתומים (מעל 24 שעות).
 * @returns {Promise<{storageMissing:boolean, scanned:number, jobsPurged:number, inputsDeleted:number,
 *   resultsDeleted:number, rejectedDeleted:number, kept:number, tmpDeleted:number, truncated:boolean,
 *   errors:number, errorSamples:{jobId:string, code:string}[]}>}
 */
export async function purgeLocalJobFiles({
  now = new Date(),
  env = process.env,
  retentionMs = FILE_RETENTION_MS,
  limit = CLEANUP_JOB_LIMIT,
  maxMs = CLEANUP_MAX_MS,
  clock = Date.now,
} = {}) {
  const summary = {
    storageMissing: false,
    scanned: 0,
    jobsPurged: 0,
    inputsDeleted: 0,
    resultsDeleted: 0,
    rejectedDeleted: 0,
    kept: 0,
    tmpDeleted: 0,
    truncated: false,
    errors: 0,
    errorSamples: [],
  };
  const addError = (e) => {
    summary.errors++;
    if (summary.errorSamples.length < MAX_ERROR_SAMPLES) summary.errorSamples.push(e);
  };
  if (!(await storageAvailable(env))) {
    summary.storageMissing = true;
    console.error('[ocr-local-cleanup] storage root missing — nothing purged');
    return summary;
  }

  const startedAt = clock();
  const jobs = await OcrJob.find(cleanupCandidateFilter(now, { retentionMs }))
    .select(CANDIDATE_FIELDS)
    .sort({ _id: 1 })
    .limit(limit)
    .lean();
  summary.truncated = jobs.length >= limit;

  for (const job of jobs) {
    if (clock() - startedAt > maxMs) {
      summary.truncated = true;
      break;
    }
    summary.scanned++;
    try {
      const r = await purgeJobFiles(job, { now, env, retentionMs });
      summary.inputsDeleted += r.deleted.input;
      summary.resultsDeleted += r.deleted.result;
      summary.rejectedDeleted += r.deleted.rejected;
      summary.kept += r.kept;
      if (r.dirRemoved) summary.jobsPurged++;
      r.errors.forEach(addError);
    } catch (e) {
      addError({ jobId: String(job._id), code: String(e?.code ?? e?.message ?? 'error') });
      // נבדקת שוב אחרי RECHECK_MS — לא בראש התור בכל הרצה (best-effort)
      await OcrJob.updateOne(
        { _id: job._id, method: 'local', active: false },
        { $set: { filesCheckedAt: now } },
        { timestamps: false }
      ).catch(() => {});
    }
  }

  try {
    summary.tmpDeleted = await sweepTmpFiles(FILE_RETENTION_MS, { now: now.getTime(), env });
  } catch (e) {
    addError({ jobId: '', code: String(e?.code ?? 'tmp_sweep_failed') });
  }
  if (summary.errors > 0) {
    console.error(
      `[ocr-local-cleanup] ${summary.errors} errors: ${summary.errorSamples.map((x) => `${x.jobId}:${x.code}`).join(', ')}`
    );
  }
  return summary;
}

/**
 * הרצת ה-cron: קודם השלמת קליטות תקועות (כדי שעבודה שתושלם תקבל ack ותיכנס לחלון השמירה), ואז
 * ניקוי הקבצים. כשל בשלב אחד לא מונע את השני.
 */
export async function runLocalOcrCleanup({ now = new Date(), env = process.env, resumeLimit = RESUME_LIMIT, ...opts } = {}) {
  let resumed;
  try {
    const results = await resumeStalledApplies({ now, env, limit: resumeLimit });
    resumed = { count: results.length, ok: results.filter((r) => r.ok).length, results };
  } catch (e) {
    console.error(`[ocr-local-cleanup] resumeStalledApplies failed: ${String(e?.code ?? e?.name ?? 'error')}`);
    resumed = { count: 0, ok: 0, results: [], error: 'resume_failed' };
  }
  const purge = await purgeLocalJobFiles({ now, env, ...opts });
  return { resumed, purge };
}

// קבלת גוף התוצאה מהעובד (POST /api/worker/v1/jobs/{id}/result) עד הקריאה ל-receiveResult:
// זרימה לדיסק עם תקרה, sha256 בזמן הכתיבה והשוואה ל-X-Result-SHA256, פענוח וולידציה — ותוצאה
// שנדחתה (400/410/422) נשמרת לבירור כ-rejected-<sha>.json ולא מוחלת. מפרט סעיף 4א.
//
// זיכרון: הגוף (עד 100MiB) לא נאסף בזיכרון בזמן ההעלאה — נכתב בזרימה לקובץ זמני ועובר rename
// עמיד (writeJobFileDurable). לפענוח ה-JSON חייבים את כל הטקסט בזיכרון בכל מקרה (JSON.parse),
// ולכן הקובץ נקרא חזרה מהדיסק פעם אחת אחרי שה-hash אומת.
//
// imports יחסיים בלבד (נבדק ב-node:test).
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { storageRoot, writeJobFileDurable } from './localStorage.js';
import { MAX_RESULT_BYTES, parseResultBytes, validateResult, validationDetails } from './localResultValidate.js';
import { receiveResult, recordRejectedFile, storedAnswerFor } from './localApply.js';

// תקרת בטיחות לרשומות דחייה בעבודה (לא נדחקות — הניקוי מוחק קובץ דחייה לפי receivedAt שברשומה):
// מעליה דחייה נוספת עונה אותו 400/422/410 בלי לשמור קובץ
export const MAX_RESULT_REJECTIONS = 20;
export const STORAGE_RETRY_AFTER_SEC = 300;
// שגיאות דיסק/הרשאה בכתיבה — זמניות מבחינת העובד (503 + Retry-After), לא 500 עם פרטים
const STORAGE_ERROR_CODES = new Set(['ENOSPC', 'EDQUOT', 'EROFS', 'EACCES', 'EPERM', 'EIO', 'ENOENT', 'ENOTDIR', 'EMFILE']);

export class ResultTooLargeError extends Error {
  constructor() {
    super('result exceeds the size limit');
    this.name = 'ResultTooLargeError';
  }
}

export class UploadAbortedError extends Error {
  constructor() {
    super('upload stream failed');
    this.name = 'UploadAbortedError';
  }
}

const answer = (status, body, headers) => ({ status, body, ...(headers ? { headers } : {}) });

/**
 * גוף הבקשה (ReadableStream / async iterable של Uint8Array, או null) → חתיכות, עם תקרה.
 * מעל התקרה: ResultTooLargeError (הזרם מבוטל). כשל בקריאת הזרם עצמו (הלקוח התנתק):
 * UploadAbortedError — כך שאפשר להבחין בינו לבין כשל כתיבה לדיסק.
 */
export async function* limitedBody(body, maxBytes) {
  if (body == null) return;
  const it = typeof body[Symbol.asyncIterator] === 'function' ? body[Symbol.asyncIterator]() : body[Symbol.iterator]();
  let total = 0;
  let done = false;
  try {
    while (true) {
      let step;
      try {
        step = await it.next();
      } catch {
        done = true;
        throw new UploadAbortedError();
      }
      if (step.done) {
        done = true;
        return;
      }
      const chunk = step.value;
      total += chunk.byteLength;
      if (total > maxBytes) throw new ResultTooLargeError();
      yield chunk;
    }
  } finally {
    if (!done) await Promise.resolve(it.return?.()).catch(() => {});
  }
}

async function hashBody(body, maxBytes) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of limitedBody(body, maxBytes)) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return { sha256: hash.digest('hex'), bytes };
}

// תקלת העלאה/אחסון → תשובה; כל חריגה אחרת נזרקת (500 ב-withWorker)
function uploadFailure(e) {
  if (e instanceof ResultTooLargeError) return answer(413, { error: 'result_too_large' });
  if (e instanceof UploadAbortedError) return answer(408, { error: 'upload_incomplete' });
  if (STORAGE_ERROR_CODES.has(e?.code)) {
    console.error(`[ocr-worker] result storage error code=${String(e.code)}`);
    return answer(503, { error: 'storage_unavailable' }, { 'Retry-After': String(STORAGE_RETRY_AFTER_SEC) });
  }
  return null;
}

async function storageMissing(env) {
  try {
    return !(await fs.stat(/*turbopackIgnore: true*/ storageRoot(env))).isDirectory();
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') return true;
    throw e;
  }
}

// תוצאה שנדחתה: נרשמת בעבודה ואחר כך עוברת ל-rejected-<sha>.json (פעם אחת לכל hash, עד
// MAX_RESULT_REJECTIONS רשומות). התוצאה הנעולה של העבודה (אם יש) לעולם לא מוזזת.
async function recordRejection(job, sha, file, now, reason, details, env) {
  const locked = job.resultSha256 === sha;
  await recordRejectedFile({
    job,
    sha,
    file: locked ? null : file,
    field: 'resultRejections',
    entry: { receivedAt: now, bytes: file.bytes, reason, details, ...(locked ? { path: file.relPath } : {}) },
    limitExpr: { $lt: [{ $size: { $ifNull: ['$resultRejections', []] } }, MAX_RESULT_REJECTIONS] },
    env,
  });
}

/**
 * @param {{job:any, claimedSha:string, body:any, now?:Date, env?:any, maxBytes?:number,
 *          hooks?:{afterPageWrite?:(entry:any)=>any}}} args
 *   job — רשומת OcrJob (lean) של העובד; claimedSha — X-Result-SHA256 מנורמל לאותיות קטנות.
 *   now — ברירת מחדל: רגע סיום קבלת הגוף (לא תחילת הבקשה). העלאה של עד 100MiB יכולה להימשך דקות;
 *   ממנו נגזרים resultReceivedAt וה-lease של ההחלה, ושעון מתחילת הבקשה היה מקצר (או מפקיע מראש)
 *   את ה-lease ומסמן את העבודה כ"תקועה" ל-resumeStalledApplies בזמן שהבקשה עוד פעילה.
 * @returns {Promise<{status:number, body:any, headers?:Record<string,string>}>}
 */
export async function intakeResult({ job, claimedSha, body, now, env = process.env, maxBytes = MAX_RESULT_BYTES, hooks }) {
  // אותו hash שכבר אושר: לא שומרים שוב (הקבצים אולי כבר נוקו — "גם ימים אחר כך"), רק מוודאים
  // שהגוף אכן תואם לכותרת ומחזירים את ה-ack השמור
  if (storedAnswerFor(job, claimedSha)) {
    let hashed;
    try {
      hashed = await hashBody(body, maxBytes);
    } catch (e) {
      const failure = uploadFailure(e);
      if (failure) return failure;
      throw e;
    }
    if (hashed.sha256 !== claimedSha) return answer(400, { error: 'hash_mismatch' });
    return storedAnswerFor(job, claimedSha);
  }

  if (await storageMissing(env)) {
    console.error('[ocr-worker] result storage root missing');
    return answer(503, { error: 'storage_unavailable' }, { 'Retry-After': String(STORAGE_RETRY_AFTER_SEC) });
  }
  let file;
  try {
    // ה-hash נבדק על הקובץ הזמני (ייחודי לבקשה הזו) לפני ה-rename: גוף שלא תואם לכותרת לא
    // מגיע לשם הסופי בכלל, ולכן אין מה למחוק — ובקשה מקבילה תקינה עם אותו גוף, שכבר נעלה את
    // result-<sha>.json, לא יכולה לאבד את הקובץ שלה
    file = await writeJobFileDurable(String(job._id), 'result', limitedBody(body, maxBytes), env, {
      expectedSha256: claimedSha,
    });
  } catch (e) {
    const failure = uploadFailure(e);
    if (failure) return failure;
    throw e;
  }
  if (file.mismatch || file.sha256 !== claimedSha) return answer(400, { error: 'hash_mismatch' });
  const sha = file.sha256;
  const at = now ?? new Date();

  const parsed = parseResultBytes(await fs.readFile(/*turbopackIgnore: true*/ file.absPath));
  if (!parsed.ok) {
    await recordRejection(job, sha, file, at, 'invalid_result', '', env);
    return answer(400, { error: 'invalid_result' });
  }
  const v = validateResult(parsed.doc, job, file.bytes, maxBytes);
  if (!v.ok) {
    const details = validationDetails(v.errors);
    await recordRejection(job, sha, file, at, 'validation_failed', details, env);
    return answer(422, { error: 'validation_failed', details });
  }

  const r = await receiveResult({ jobId: job._id, sha, doc: parsed.doc, file, now: at, env, hooks });
  if (r.status === 410) await recordRejection(job, sha, file, at, 'job_closed', '', env);
  return r;
}

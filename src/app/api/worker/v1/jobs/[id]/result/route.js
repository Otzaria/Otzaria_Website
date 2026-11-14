// POST /api/worker/v1/jobs/{id}/result — קליטת קובץ התוצאה מהעובד המקומי (DeliverySender/SiteClient
// בשירות). גוף: contracts/result.schema.json (UTF-8 JSON, עד 100MiB), כותרת X-Result-SHA256.
// תשובה 200 רק אחרי שמירה עמידה וטיפול בכל העמודים: {"ack","jobId","resultSha256","outcome"} —
// בדיוק ארבעה שדות (ack.schema.json): accepted בקליטה הראשונה, already_received בשליחה חוזרת של
// אותו hash (גם ימים אחר כך), cancelled לתוצאה אחרי ביטול מפורש (outcome תמיד cancelled).
// הסדר והכללים — src/lib/ocr/localResultIntake.js ו-src/lib/ocr/localApply.js.
// שגיאות (JSON, no-store): 400 bad_hash_header / hash_mismatch / invalid_result, 404 not_found
// (תוצאה לעבודה לא מוכרת לא יוצרת עבודה), 408 upload_incomplete, 409 result_conflict, 410 job_closed,
// 413 result_too_large, 422 validation_failed (+details), 503 apply_in_progress / storage_unavailable
// (+Retry-After). דחייה לעולם אינה הצלחה — השירות מחנה את העבודה ולא סוגר אותה.
import OcrJob from '@/models/OcrJob';
import { isJobIdParam, withWorker, workerError, workerJson } from '@/lib/ocr/workerHttp';
import { workerJobFilter } from '@/lib/ocr/localEnvelope';
import { intakeResult } from '@/lib/ocr/localResultIntake';
import { MAX_RESULT_BYTES } from '@/lib/ocr/localResultValidate';

export const dynamic = 'force-dynamic';
// ההחלה על עד 2000 עמודים לפני התשובה — השירות ממתין לתשובה עד 10 דקות (Site:TransferTimeoutMinutes)
export const maxDuration = 600;

const HASH_HEADER_RE = /^[0-9a-fA-F]{64}$/;

export const POST = withWorker(async (request, { workerId, params }) => {
  const claimed = request.headers.get('x-result-sha256');
  if (typeof claimed !== 'string' || !HASH_HEADER_RE.test(claimed)) return workerError(400, 'bad_hash_header');
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_RESULT_BYTES) return workerError(413, 'result_too_large');

  const { id } = params;
  if (!isJobIdParam(id)) return workerError(404, 'not_found');
  const job = await OcrJob.findOne({ _id: id, ...workerJobFilter(workerId) }).lean();
  if (!job) return workerError(404, 'not_found');

  const r = await intakeResult({ job, claimedSha: claimed.toLowerCase(), body: request.body });
  return workerJson(r.status, r.body, r.headers);
});

// GET /api/worker/v1/jobs/{id} — מצב עבודה אחת כפי שהאתר רואה אותה (לעובד המקומי).
// השירות שואל על עבודה שנעלמה מהרשימה (JobSync.ApplyAbsent) — היעלמות לבדה אינה הצלחה.
// { jobId, state: queued|in_progress|closed|cancelled, cancelRequested, closed, ack? }.
// 404 {"error":"not_found"} למזהה לא ידוע / לא תקין / של עובד אחר / עבודה שלא נמסרה לעובד.
import OcrJob from '@/models/OcrJob';
import { isJobIdParam, withWorker, workerError, workerJson } from '@/lib/ocr/workerHttp';
import { jobInfo, workerJobFilter } from '@/lib/ocr/localEnvelope';

export const dynamic = 'force-dynamic';

export const GET = withWorker(async (_request, { workerId, params }) => {
  const { id } = params;
  if (!isJobIdParam(id)) return workerError(404, 'not_found');
  const job = await OcrJob.findOne({ _id: id, ...workerJobFilter(workerId) })
    .select({ _id: 1, status: 1, active: 1, cancelRequested: 1, ack: 1 })
    .lean();
  if (!job) return workerError(404, 'not_found');
  return workerJson(200, jobInfo(job));
});

// POST /api/worker/v1/jobs/{id}/status — דיווח מצב מהעובד המקומי (StatusReporter בשירות).
// גוף: contracts/status.schema.json. תשובה: 200 {"cancelRequested": bool} לפי מצב ה-DB אחרי
// העדכון — גם לדיווח ישן/כפול ולעבודה סגורה (לעבודה שבוטלה: true — כך העובד לומד על הביטול).
// הכללים (reportSeq עולה, בלי פתיחה מחדש, בלי סטטוס סופי) — src/lib/ocr/localStatusReport.js.
// שגיאות (JSON, no-store): 400 bad_request (לא JSON), 413 payload_too_large, 422 invalid_report
// (+field), 403 wrong_worker (workerId בגוף שונה מהמוגדר — בעיית תצורה), 404 not_found.
import OcrJob from '@/models/OcrJob';
import { isJobIdParam, readJsonBody, withWorker, workerError, workerJson } from '@/lib/ocr/workerHttp';
import { workerJobFilter } from '@/lib/ocr/localEnvelope';
import {
  MAX_STATUS_BODY_BYTES,
  marksStarted,
  statusUpdateFilter,
  statusUpdateSet,
  validateStatusReport,
} from '@/lib/ocr/localStatusReport';

export const dynamic = 'force-dynamic';

const RESPONSE_PROJECTION = { _id: 1, cancelRequested: 1 };

const answer = (job) => workerJson(200, { cancelRequested: job.cancelRequested === true });

export const POST = withWorker(async (request, { workerId, params }) => {
  const { id } = params;
  const parsed = await readJsonBody(request, MAX_STATUS_BODY_BYTES);
  if (!parsed.ok) return workerError(parsed.status, parsed.error);
  const v = validateStatusReport(parsed.body);
  if (!v.ok) return workerError(v.status, v.error, v.field ? { field: v.field } : {});
  const { report } = v;
  if (report.workerId !== workerId) return workerError(403, 'wrong_worker');
  if (!isJobIdParam(id)) return workerError(404, 'not_found');

  const now = new Date();
  // עדכון מותנה יחיד (אטומי): רק אם הדיווח חדש מהשמור והעבודה פעילה ובסטטוס שדיווח מעדכן
  const updated = await OcrJob.findOneAndUpdate(
    statusUpdateFilter(id, workerId, report.reportSeq),
    { $set: statusUpdateSet(report, now) },
    { returnDocument: 'after', projection: RESPONSE_PROJECTION }
  ).lean();
  if (updated) {
    if (marksStarted(report.state)) {
      await OcrJob.updateOne({ _id: id, active: true, startedAt: null }, { $set: { startedAt: now } });
    }
    return answer(updated);
  }

  // לא עודכן: דיווח ישן/כפול, עבודה בהחלת תוצאה, עבודה סגורה — או שאינה של העובד (404).
  // לעבודה פעילה מעדכנים רק את lastSeenAt (לתצוגה); עבודה סגורה לא נכתבת בכלל.
  const seen = await OcrJob.findOneAndUpdate(
    { _id: id, ...workerJobFilter(workerId), active: true },
    { $max: { lastSeenAt: now } },
    { returnDocument: 'after', projection: RESPONSE_PROJECTION, timestamps: false }
  ).lean();
  if (seen) return answer(seen);
  const job = await OcrJob.findOne({ _id: id, ...workerJobFilter(workerId) }).select(RESPONSE_PROJECTION).lean();
  if (!job) return workerError(404, 'not_found');
  return answer(job);
});

// GET /api/worker/v1/jobs/{id}/input — קובץ ה-PDF של העבודה, בזרימה מהדיסק (עד 1GiB, בלי
// טעינה לזיכרון). רק לעבודה של העובד שעדיין יש לה קלט; עבודה שבוטלה וקובצה עוד קיים — מוגשת.
// שגיאות (JSON, no-store) — ראו openJobInput: 404 not_found / input_unavailable, 409 input_corrupt,
// 503 storage_unavailable (עם Retry-After).
import OcrJob from '@/models/OcrJob';
import { isJobIdParam, withWorker, workerError } from '@/lib/ocr/workerHttp';
import { workerJobFilter } from '@/lib/ocr/localEnvelope';
import { openJobInput } from '@/lib/ocr/localInputFile';

export const dynamic = 'force-dynamic';

export const GET = withWorker(async (_request, { workerId, params }) => {
  const { id } = params;
  if (!isJobIdParam(id)) return workerError(404, 'not_found');
  const job = await OcrJob.findOne({ _id: id, ...workerJobFilter(workerId) })
    .select({ _id: 1, inputPath: 1, inputSha256: 1, inputBytes: 1, inputPurgedAt: 1 })
    .lean();
  if (!job) return workerError(404, 'not_found');

  const input = await openJobInput(job);
  if (!input.ok) {
    if (input.code === 'input_corrupt' || input.code === 'storage_unavailable') {
      console.error(`[ocr-worker] input ${input.code} job=${id}`);
    }
    return workerError(input.status, input.code, {}, input.retryAfter ? { 'Retry-After': String(input.retryAfter) } : {});
  }
  return new Response(input.stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(input.size),
      'X-Content-SHA256': input.sha256,
      'Cache-Control': 'no-store',
    },
  });
});

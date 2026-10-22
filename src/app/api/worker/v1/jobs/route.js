// GET /api/worker/v1/jobs?limit=100&cursor=<opaque> — רשימת העבודות הלא-סגורות של העובד המקומי.
// נצרך ע"י שירות OtzariaTaskAgent (JobSync) — החוזה: HANDOVER סעיף 3 בריפו השירות.
// { items:[מעטפה + cancelRequested + siteState], nextCursor: מחרוזת | null } — nextCursor תמיד
// קיים; מהישנה לחדשה; עבודה ב-preparing (בלי קלט) לא מופיעה. כל תשובה JSON עם no-store.
import OcrJob from '@/models/OcrJob';
import { withWorker, workerError, workerJson } from '@/lib/ocr/workerHttp';
import { ENVELOPE_PROJECTION, listFilter, pageOf, parseListQuery } from '@/lib/ocr/localEnvelope';

export const dynamic = 'force-dynamic';

export const GET = withWorker(async (request, { workerId }) => {
  const q = parseListQuery(new URL(request.url).searchParams);
  if (q.error) return workerError(400, q.error);
  const jobs = await OcrJob.find(listFilter(workerId, q.cursor))
    .sort({ _id: 1 })
    .limit(q.limit + 1)
    .select(ENVELOPE_PROJECTION)
    .lean();
  return workerJson(200, pageOf(jobs, q.limit));
});

import { adminGate, ok, crash } from '../_lib/http';
import { listReview, queueStats } from '../_lib/review';
import { parseReviewQuery } from '../_lib/rules';

// GET ?section=ocr|router|frames&status=submitted|approved&track=&action=&vol=&lowConf=1&agree=1|0&page=
// ← {items, total, page, pages, stats} — רשימת הסקירה (50 בעמוד) והמונים של כל התור
// (לכפתורי האישור המהיר: "נכון" שלא שונו, הסכמה עם הנתב, ולכל מתנדב — ממתינות ושיעור-התאמה).
export async function GET(request) {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const q = parseReviewQuery(new URL(request.url).searchParams);
    const [list, stats] = await Promise.all([listReview(q), queueStats(q.section)]);
    return ok({ ...list, stats });
  } catch (e) {
    return crash('review', e);
  }
}

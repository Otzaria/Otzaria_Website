import { adminGate, ok, fail, sectionOf, validId, crash, NO_STORE } from '../../../_lib/http';
import { offlinePlan, buildOffline } from '../../../_lib/offline';
import { BOOK_RE } from '@/lib/trainingProof/vocab';
import { OFFLINE_ID_RE, newOfflineId, clampPer, offlineFileName } from '@/lib/trainingProof/offline/contract';

export const maxDuration = 300;

// "אישור בלי אינטרנט" (docs/115 §3) — ההורדה. GET ולא POST: היא **אינה משנה דבר** באתר
// (הפריטים נשארים ממתינים, ואפשר להמשיך לאשר אותם גם כאן), ולכן קישור רגיל בדפדפן מוריד אותה.
//
// GET ?plan=1[&n=1000]                        ← {offlineId, count, parts:[{after,through,count}]} | {offlineId, count, books:[…]}
// GET ?oid=…&part=&parts=&after=&through=&n=&ctx=1 ← קובץ HTML (זיהוי/נתב): הטווח (after, through]
// GET ?oid=…&part=&parts=&book=b-…            ← קובץ HTML (גלאי): כל העמודים הממתינים של ספר אחד
export async function GET(request, { params }) {
  const { error } = await adminGate();
  if (error) return error;
  const { section: raw } = await params;
  const section = sectionOf(raw);
  if (!section) return fail(400, 'חלק לא מוכר');
  const q = new URL(request.url).searchParams;
  const per = clampPer(q.get('n'));
  try {
    if (q.get('plan') === '1') {
      const plan = await offlinePlan(section, per);
      return ok({ offlineId: newOfflineId(), per, ...plan });
    }
    const offlineId = q.get('oid') || '';
    if (!OFFLINE_ID_RE.test(offlineId)) return fail(400, 'מזהה-הורדה לא תקין');
    const part = Math.max(1, parseInt(q.get('part'), 10) || 1);
    const parts = Math.max(part, parseInt(q.get('parts'), 10) || 1);
    const after = q.get('after') || null;
    if (after && !validId(after)) return fail(400, 'נקודת-התחלה לא תקינה');
    const through = q.get('through') || null;
    if (through && !validId(through)) return fail(400, 'נקודת-סיום לא תקינה');
    if (after && through && after.toLowerCase() >= through.toLowerCase()) return fail(400, 'טווח המזהים לא תקין');
    if (section !== 'frames' && !through && (parts > 1 || after)) return fail(409, 'תכנית ההורדה ישנה — הכינו מחדש את רשימת הקבצים');
    const book = q.get('book') || null;
    if (section === 'frames' && !BOOK_RE.test(String(book || ''))) return fail(400, 'בגלאי מורידים ספר אחד בכל קובץ');
    const r = await buildOffline({
      section,
      offlineId,
      part,
      parts,
      after,
      through,
      n: per,
      book,
      ctx: q.get('ctx') !== '0',
      site: new URL(request.url).origin,
    });
    if (r.overflow) return fail(409, 'נוספו הגשות בטווח הזה — הכינו מחדש את רשימת הקבצים');
    if (!r.count) return fail(409, 'אין כאן מה להוריד — אולי כבר אושר באתר');
    const it = r.chunks();
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async pull(ctrl) {
        try {
          const { value, done } = await it.next();
          if (done) ctrl.close();
          else if (value) ctrl.enqueue(enc.encode(value));
        } catch (e) {
          console.error('training-proof offline stream', e?.message || e);
          ctrl.error(e);
        }
      },
      async cancel() {
        await it.return?.();
      },
    });
    return new Response(stream, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${offlineFileName({ section, offlineId, part, parts })}"`,
        'X-Item-Count': String(r.count),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return crash('offline download', e, 'בניית הקובץ נכשלה');
  }
}

import { setStreamKind } from '../../../../_lib/framesDb';
import { gate, fromResult, bookParam, json, readJson, serverError } from '../../../../_lib/http';

const STREAM_RE = /^[A-Za-z0-9_-]{1,32}$/;

// PATCH /api/training-proof/frames/books/<book>/streams/<id> {role} — שינוי הסוג של זרם. הסוג עובר לכל המסגרות של
// הזרם בעמודים שעוד לא אושרו, ויוצא לתחנה ב-streams_added (זרם שנוסף באתר) או ב-streams_changed (זרם מהתחנה;
// docs/76 §5.3). רק מי שמחזיק את הספר. ← {success, stream, streams, pages} · 400 (סוג לא מתאים) · 409
export async function PATCH(request, { params }) {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    const p = await params;
    const book = bookParam(p.book);
    if (!book || !STREAM_RE.test(String(p.stream || ''))) return json({ success: false, error: 'מזהה לא תקין' }, 400);
    const { body, tooBig } = await readJson(request);
    if (tooBig || !body || typeof body !== 'object') return json({ success: false, error: 'בקשה לא תקינה' }, 400);
    return fromResult(await setStreamKind(g.userId, book, String(p.stream), body));
  } catch (e) {
    return serverError('stream PATCH', e);
  }
}

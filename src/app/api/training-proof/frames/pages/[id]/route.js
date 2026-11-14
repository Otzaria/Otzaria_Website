import mongoose from 'mongoose';
import { checkRateLimit } from '@/lib/rate-limit';
import { savePage } from '../../_lib/framesDb';
import { gate, fromResult, json, readJson, serverError } from '../../_lib/http';

// PUT /api/training-proof/frames/pages/<id> {status, frames} — שמירה מיידית של עמוד (ה-4):
//   status 'draft'  — כל שינוי בעורך (טיוטה; העמוד עוד לא אושר)
//   status 'marked' — "העמוד נכון (כולל הסדר)" (Enter) · 'skip' — "דלג — לא לאימון"
// רק מי שמחזיק את הספר עכשיו. התוצאה נשמרת בצורה של קובץ-ההחזרה (docs/76 §5.3).
// ← {success, page, bookDone} · 400 (סימון לא תקין, עם הסבר) · 409 (הספר לא אצלך / המנהל אישר) · 413 · 429
const RATE = { tokens: 240, interval: 'minute' };

export async function PUT(request, { params }) {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return json({ success: false, error: 'מזהה עמוד לא תקין' }, 400);
    const { body, tooBig } = await readJson(request);
    if (tooBig) return json({ success: false, error: 'יותר מדי מסגרות' }, 413);
    if (!body || typeof body !== 'object') return json({ success: false, error: 'בקשה לא תקינה' }, 400);
    if (!checkRateLimit(`user:${g.userId}`, 'training-proof-frames', RATE.tokens, RATE.interval)) {
      return json({ success: false, error: 'יותר מדי שמירות ברצף — נסו שוב בעוד רגע' }, 429);
    }
    return fromResult(await savePage(g.userId, id, body));
  } catch (e) {
    return serverError('page PUT', e);
  }
}

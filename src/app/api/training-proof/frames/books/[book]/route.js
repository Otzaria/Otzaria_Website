import { bookDetail } from '../../_lib/framesDb';
import { gate, fromResult, bookParam, json, serverError } from '../../_lib/http';

// GET /api/training-proof/frames/books/<book> — הספר וכל עמודיו לעורך: למי שמחזיק את הספר, ולמנהל (סקירה).
// ← {success, book:{book, alias, kind, streams, claimedUntil, mine}, pages:[{id, page, w, h, img, thumb, ptype,
//    state, by, frames, proposal, adminFixed}]} · 403 (הספר לא אצלך) · 404
export async function GET(request, { params }) {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    const book = bookParam((await params).book);
    if (!book) return json({ success: false, error: 'מזהה ספר לא תקין' }, 400);
    return fromResult(await bookDetail(g.userId, book, { isAdmin: g.isAdmin }));
  } catch (e) {
    return serverError('book GET', e);
  }
}

import { claimBook } from '../../../_lib/framesDb';
import { gate, fromResult, bookParam, json, serverError } from '../../../_lib/http';

// POST /api/training-proof/frames/books/<book>/claim — "קח את הספר" / "המשך מהעבודה הקודמת": כל הספר שמור
// למתנדב ל-48 שעות (docs/76 §8.2). ספר שכבר אצלו — בלי לשנות את המועד.
// ← {success, book, claimedUntil, already} · 409 (אצל אחר / כבר יש לך ספר / הושלם) · 404
export async function POST(request, { params }) {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    const book = bookParam((await params).book);
    if (!book) return json({ success: false, error: 'מזהה ספר לא תקין' }, 400);
    return fromResult(await claimBook(g.userId, book));
  } catch (e) {
    return serverError('claim POST', e);
  }
}

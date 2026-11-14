import { releaseBook } from '../../../_lib/framesDb';
import { gate, fromResult, bookParam, json, serverError } from '../../../_lib/http';

// POST /api/training-proof/frames/books/<book>/release — "שחרר את הספר": הסימונים נשמרים, והספר חוזר
// לרשימה כ"הופסק באמצע". ← {success} · 409 (הספר לא אצלך)
export async function POST(request, { params }) {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    const book = bookParam((await params).book);
    if (!book) return json({ success: false, error: 'מזהה ספר לא תקין' }, 400);
    return fromResult(await releaseBook(g.userId, book));
  } catch (e) {
    return serverError('release POST', e);
  }
}

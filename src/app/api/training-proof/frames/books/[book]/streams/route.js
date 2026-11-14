import { addStream } from '../../../_lib/framesDb';
import { gate, fromResult, bookParam, json, readJson, serverError } from '../../../_lib/http';

// POST /api/training-proof/frames/books/<book>/streams {name, role} — זרם חדש לספר (מזהה x1, x2…). הוא יוצא
// לתחנה ב-streams_added של כל עמוד שמשתמש בו (docs/76 §5.3). רק מי שמחזיק את הספר.
// ← {success, stream, streams} · 400 (שם ריק/כפול, תפקיד לא מתאים) · 409
export async function POST(request, { params }) {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    const book = bookParam((await params).book);
    if (!book) return json({ success: false, error: 'מזהה ספר לא תקין' }, 400);
    const { body, tooBig } = await readJson(request);
    if (tooBig || !body || typeof body !== 'object') return json({ success: false, error: 'בקשה לא תקינה' }, 400);
    return fromResult(await addStream(g.userId, book, body));
  } catch (e) {
    return serverError('streams POST', e);
  }
}

import { adminGate, ok, fail, jsonBody, sectionOf, validId, crash } from '../../_lib/http';
import { bulkApprove } from '../../_lib/review';
import { BOOK_RE } from '@/lib/trainingProof/vocab';

// POST {section, kind, vol?, book?, dry?} ← {count} — אישור גורף על כל התור בחלק (לא רק
// על מה שבמסך). kind: ok-unchanged (זיהוי) · volunteer (+vol) · router-agree (נתב) ·
// book (גלאי, +book). dry:true — רק סופר, לחלון-האישור שבדף.
export async function POST(request) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const { body, error: bad } = await jsonBody(request);
  if (bad) return bad;
  const section = sectionOf(body.section);
  if (!section || typeof body.kind !== 'string') return fail(400, 'חסרים חלק וסוג אישור');
  const vol = body.vol == null ? null : validId(body.vol) ? String(body.vol) : undefined;
  const book = body.book == null ? null : BOOK_RE.test(String(body.book)) ? String(body.book) : undefined;
  if (vol === undefined || book === undefined) return fail(400, 'מתנדב או ספר לא תקינים');
  try {
    const r = await bulkApprove(section, body.kind, { vol, book, dry: body.dry === true }, userId);
    if (r.error) return fail(400, r.error);
    return ok({ count: r.count, dry: body.dry === true });
  } catch (e) {
    return crash('bulk', e);
  }
}

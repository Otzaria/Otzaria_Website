import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { reopenPages } from '@/lib/pageProof/reopen';
import { readJsonBody, tooBigResponse } from '@/lib/pageProof/pool';
import { fromResult, noStore } from '@/lib/pageProof/respond';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';

// POST {ids}: "פתח מחדש לעריכה" לעמודים מאושרים (docs/63 §5; lib/pageProof/reopen.js). העמוד חוזר להיות פתוח
// למתנדבים; ההגשות שאושרו נשארות בהיסטוריה, ומי שיתפוס אותו מתחיל מהגרסה שאושרה (מסומנת). האישור הבא — שוב בידי מנהל.
// ← {success, reopened, pages, skipped:[{id, page, error}]}. רק מנהל OCR — גם במפתח-גישה של תוכנת-הספר (review);
// מתנדב ← 403. private, no-store.

const GID_RE = /^[A-Za-z0-9]{8,64}$/;
// גוף הבקשה: עד MAX_IDS מזהים (reopen.js) — כמה קילובייטים לכל היותר
const MAX_REOPEN_BODY = 64 * 1024;

export async function POST(request, { params }) {
  const { session, denied: keyDenied } = await getPageProofSession(request, 'review');
  if (keyDenied) return noStore(keyDenied);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return noStore(denied);
  try {
    const { gid } = await params;
    if (!GID_RE.test(String(gid))) return noStore(badRequest('gid לא תקין'));
    const { body, tooBig } = await readJsonBody(request, MAX_REOPEN_BODY);
    if (tooBig) return noStore(tooBigResponse());
    if (!body || typeof body !== 'object' || Array.isArray(body)) return noStore(badRequest('גוף הבקשה חסר'));
    await connectDB();
    return fromResult(await reopenPages(gid, body.ids, { name: session.user?.name || '' }));
  } catch (e) {
    console.error('admin page-proof reopen POST', e);
    return noStore(serverError());
  }
}

import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession, readJsonBody } from '@/lib/pageProof/pool';
import { saveDraft } from '@/lib/pageProof/serverDrafts';
import { DRAFT_MSG, DRAFT_RATE } from '@/lib/pageProof/draftRules';
import { checkRateLimit } from '@/lib/rate-limit';
import { json, noStore } from '@/lib/pageProof/respond';
import { badRequest, serverError } from '@/lib/apiResponse';

// PUT {revision, ops, stage?, reset?, baseUpdatedAt?}: הטיוטה של העמוד בשרת (docs/63 §2; lib/pageProof/serverDrafts.js). רק מי שמחזיק
// עכשיו בעמוד (התפיסה שלו בתוקף, והוא לא הגיש אותו), בגרסה הנוכחית של העמוד. הדפדפן שולח לכל היותר פעם בכ-5 שניות
// (useServerDraft); כאן — תקרת-גודל (כמו הגשה) והאטה לכל משתמש.
// ← {success, updatedAt, count, dropped, stage} · 400 · 403 {code:'not_holder'} · 409 {code:'reload'} (העמוד הוחלף —
//   חזר מזיהוי-מחדש) · 409 {code:'stale'} (הטיוטה נשמרה בינתיים בלשונית/מחשב אחר) · 413 · 429 {code:'rate'}. הכול
//   private, no-store.
export async function PUT(request, { params }) {
  const { session, userId, error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return noStore(badRequest('מזהה עמוד לא תקין'));
    const { body, tooBig } = await readJsonBody(request);
    if (tooBig) return json({ success: false, error: 'הטיוטה גדולה מדי' }, 413);
    if (!body || typeof body !== 'object' || !Array.isArray(body.ops)) return noStore(badRequest(DRAFT_MSG.ops));
    if (!checkRateLimit(`user:${userId}`, 'page-proof-draft', DRAFT_RATE.tokens, DRAFT_RATE.interval)) {
      return json({ success: false, error: DRAFT_MSG.rate, code: 'rate' }, 429);
    }
    await connectDB();
    const revision = Number.isInteger(body.revision) ? body.revision : null;
    // baseUpdatedAt: מחרוזת-זמן או null; בלי השדה — לקוח ישן, בלי בדיקת-התנגשות
    const base = !('baseUpdatedAt' in body) ? undefined : typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt.slice(0, 40) : null;
    const r = await saveDraft(id, userId, { revision, ops: body.ops, stage: body.stage, reset: body.reset === true, baseUpdatedAt: base }, session.user?.name || '');
    if (!r.ok) return json({ success: false, error: r.error, ...(r.code ? { code: r.code } : {}) }, r.status || 409);
    const { ok: _ok, ...rest } = r;
    return json({ success: true, ...rest });
  } catch (e) {
    console.error('page-proof draft PUT', e);
    return noStore(serverError());
  }
}

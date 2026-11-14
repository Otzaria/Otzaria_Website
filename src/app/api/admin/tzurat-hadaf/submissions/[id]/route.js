import { adminGate } from '@/lib/tzuratHadaf/session';
import { submissionDetail, plainSubmission } from '@/lib/tzuratHadaf/admin';
import { approveSubmission, rejectSubmission } from '@/lib/tzuratHadaf/submissions';
import { json, badRequest, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// GET ← {submission, page, anchors, items, reports}
// PATCH {action:'approve'|'reject', note, lineOps?} ← {submission}. אישור: +10 נקודות למגיש (פעם אחת); lineOps — העוגנים
// אחרי תיקון המנהל. דחייה: העמוד חוזר למאגר (מהגשה ממתינה, או ממאושרת שעוד לא יצאה בייצוא).
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    const { id } = await params;
    return fromResult(await submissionDetail(id));
  } catch (e) {
    console.error('tzurat admin submission GET', e);
    return serverError();
  }
}

export async function PATCH(request, { params }) {
  const { admin, denied } = await adminGate(request, 'review');
  if (denied) return denied;
  try {
    const { id } = await params;
    const { body, tooBig } = await readJsonBody(request);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    let r;
    if (body.action === 'approve') r = await approveSubmission(id, admin, { note: body.note, lineOps: body.lineOps });
    else if (body.action === 'reject') r = await rejectSubmission(id, admin, { note: body.note });
    else return badRequest('פעולה לא מוכרת');
    if (!r.ok) return fromResult(r);
    return json({ submission: plainSubmission(r.submission) });
  } catch (e) {
    console.error('tzurat admin submission PATCH', e);
    return serverError();
  }
}

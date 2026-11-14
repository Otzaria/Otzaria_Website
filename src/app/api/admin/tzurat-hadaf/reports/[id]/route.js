import TzuratPage from '@/models/TzuratPage';
import { adminGate } from '@/lib/tzuratHadaf/session';
import { setReportStatus } from '@/lib/tzuratHadaf/reports';
import { reportShape } from '@/lib/tzuratHadaf/admin';
import { json, badRequest, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// PATCH {status, note} — סטטוס הדיווח ← {report}. fixed מזכה את המדווח ב-2 נקודות (פעם אחת).
export async function PATCH(request, { params }) {
  const { admin, denied } = await adminGate(request, 'review');
  if (denied) return denied;
  try {
    const { id } = await params;
    const { body, tooBig } = await readJsonBody(request, 16 * 1024);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    const r = await setReportStatus(id, { status: body.status, note: body.note, buildId: body.buildId }, admin);
    if (!r.ok) return fromResult(r);
    const page = await TzuratPage.findById(r.report.page, { scan: 1, ours: 1, buildId: 1, round: 1, masechet: 1, daf: 1 }).lean();
    return json({ report: reportShape(r.report, page) });
  } catch (e) {
    console.error('tzurat admin report PATCH', e);
    return serverError();
  }
}

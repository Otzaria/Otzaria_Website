import { adminGate } from '@/lib/tzuratHadaf/session';
import { applySync } from '@/lib/tzuratHadaf/reports';
import { json, badRequest, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// POST {reports:[{id, status, note, buildId}], pages:[{slug, dafKey, action:'reopen'|'close', note}]} — סטטוסים מצורת הדף
// (PACKAGE.md §4) ← {reports, pages, errors} (מונים של מה שעודכן). fixed מזכה את המדווח (פעם אחת).
export const maxDuration = 300;

export async function POST(request) {
  const { admin, denied } = await adminGate(request, 'import');
  if (denied) return denied;
  try {
    const { body, tooBig } = await readJsonBody(request, 8 * 1024 * 1024);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    const r = await applySync(body, admin);
    if (!r.ok) return fromResult(r);
    return json({ reports: r.reports, pages: r.pages, errors: r.errors });
  } catch (e) {
    console.error('tzurat sync', e);
    return serverError();
  }
}

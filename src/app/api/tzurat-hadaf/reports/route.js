import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { createReport } from '@/lib/tzuratHadaf/volunteer';
import { checkRateLimit } from '@/lib/rate-limit';
import { json, badRequest, errorJson, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// POST {page, category, text, regions} — דיווח חופשי על עמוד (גם מחוץ להגשה) ← {id}
export async function POST(request) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    if (!checkRateLimit(`user:${g.userId}`, 'tzurat-report', 30, 'minute')) return errorJson(429, 'יותר מדי דיווחים — נסו שוב בעוד דקה');
    const { body, tooBig } = await readJsonBody(request, 64 * 1024);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    const r = await createReport(g.user, body);
    if (!r.ok) return fromResult(r);
    return json({ id: r.id }, 201);
  } catch (e) {
    console.error('tzurat report', e);
    return serverError();
  }
}

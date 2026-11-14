import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { saveDraft, MAX_DRAFT_BYTES } from '@/lib/tzuratHadaf/pages';
import { checkRateLimit } from '@/lib/rate-limit';
import { json, badRequest, errorJson, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// PUT {stage, state, baseUpdatedAt} — טיוטה של המחזיק בלבד ← {updatedAt}; 409 {code:'stale'|'not_holder'}
export async function PUT(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    if (!checkRateLimit(`user:${g.userId}`, 'tzurat-draft', 40, 'minute')) return errorJson(429, 'יותר מדי שמירות — נסו שוב בעוד דקה');
    const { id } = await params;
    const { body, tooBig } = await readJsonBody(request, MAX_DRAFT_BYTES);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    const r = await saveDraft(id, g.userId, { version: body.version, stage: body.stage, state: body.state, baseUpdatedAt: body.baseUpdatedAt || null });
    if (!r.ok) return fromResult(r);
    return json({ updatedAt: r.updatedAt });
  } catch (e) {
    console.error('tzurat draft', e);
    return serverError();
  }
}

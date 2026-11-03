import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { answerChoice, hasPractice } from '@/lib/tzuratHadaf/items';
import { json, badRequest, errorJson, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';
import { itemsPaused, PAUSED_MSG } from '@/lib/tzuratHadaf/pause';

// POST {choice, text?, via:'fast'|'page'} ← {status:'recorded'|'agreed'|'disputed', points: 0|1}; 409 {code:'closed'|'answered'}
export async function POST(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  if (itemsPaused()) return errorJson(503, PAUSED_MSG, 'paused');
  try {
    // המסלול המהיר נפתח רק אחרי התרגול (כשיש תרגול); מסכת מושהית — 409 paused (items.addAnswer)
    if (!g.practiceDone && (await hasPractice())) return errorJson(403, 'יש לסיים קודם את התרגול', 'practice');
    const { id } = await params;
    const { body, tooBig } = await readJsonBody(request, 8192);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body.choice !== 'string') return badRequest('התשובה חסרה');
    const r = await answerChoice(id, g.user, { revision: body.revision, choice: body.choice, text: body.text, via: body.via === 'page' ? 'page' : 'fast' });
    if (!r.ok) return fromResult(r);
    return json({ status: r.status, points: r.points });
  } catch (e) {
    console.error('tzurat answer', e);
    return serverError();
  }
}

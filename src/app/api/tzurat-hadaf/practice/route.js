import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { practiceItems, gradePractice } from '@/lib/tzuratHadaf/items';
import { json, badRequest, errorJson, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';
import { itemsPaused, PAUSED_MSG } from '@/lib/tzuratHadaf/pause';

// GET — עד 10 שאלות תרגול (FastItem + explain). POST {answers:[{id, choice, text?}]} ← {score, total, results};
// מסמן שהמתנדב סיים את התרגול (בכל ציון).
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  if (itemsPaused()) return errorJson(503, PAUSED_MSG, 'paused');
  try {
    return json({ items: await practiceItems(g.userId) });
  } catch (e) {
    console.error('tzurat practice GET', e);
    return serverError();
  }
}

export async function POST(request) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  if (itemsPaused()) return errorJson(503, PAUSED_MSG, 'paused');
  try {
    const { body, tooBig } = await readJsonBody(request, 64 * 1024);
    if (tooBig) return tooBigResponse();
    if (!body || !Array.isArray(body.answers)) return badRequest('רשימת התשובות חסרה');
    return fromResult(await gradePractice(g.userId, body.answers));
  } catch (e) {
    console.error('tzurat practice POST', e);
    return serverError();
  }
}

import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { flagItem } from '@/lib/tzuratHadaf/items';
import { checkRateLimit } from '@/lib/rate-limit';
import { json, errorJson, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';
import { itemsPaused, PAUSED_MSG } from '@/lib/tzuratHadaf/pause';

// POST {reason} — "החיתוך לא מראה את המקום" ← {ok:true, flagged}. רך: הפריט עובר לבדיקת מנהל רק אחרי שני
// משתמשים שונים (items.flagItem); עד 10 סימונים לדקה למשתמש.
export async function POST(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  if (itemsPaused()) return errorJson(503, PAUSED_MSG, 'paused');
  try {
    if (!checkRateLimit(`user:${g.userId}`, 'tzurat-flag', 10, 'minute')) return errorJson(429, 'יותר מדי סימונים — נסו שוב בעוד דקה');
    const { id } = await params;
    const { body, tooBig } = await readJsonBody(request, 8192);
    if (tooBig) return tooBigResponse();
    const r = await flagItem(id, g.userId, body?.reason);
    if (!r.ok) return fromResult(r);
    return json({ ok: true, flagged: r.flagged });
  } catch (e) {
    console.error('tzurat flag', e);
    return serverError();
  }
}

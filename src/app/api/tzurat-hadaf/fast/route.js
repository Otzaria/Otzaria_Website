import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { sampleFastItem, fastItemFor, fastStats, parseExclude, hasPractice } from '@/lib/tzuratHadaf/items';
import { json, badRequest, errorJson, serverError } from '@/lib/tzuratHadaf/respond';
import { itemsPaused, PAUSED_MSG } from '@/lib/tzuratHadaf/pause';

// GET ?exclude=id,id&kind=any|g|r|t — שאלה אחת למסלול המהיר ← {item: FastItem|null, stats, needPractice, practiceDone}.
// עד שהמתנדב סיים את התרגול (כשיש תרגול) — needPractice ו-item: null.
export const dynamic = 'force-dynamic';
const KINDS = ['any', 'g', 'r', 't'];

export async function GET(request) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  if (itemsPaused()) return errorJson(503, PAUSED_MSG, 'paused');
  try {
    const sp = new URL(request.url).searchParams;
    const kind = sp.get('kind') || 'any';
    if (!KINDS.includes(kind)) return badRequest('kind לא תקין');
    const stats = sp.get('stats') === '1' ? await fastStats(g.userId) : null;
    const flags = { practiceDone: g.practiceDone };
    if (!g.practiceDone && (await hasPractice())) return json({ item: null, stats, needPractice: true, ...flags });
    const doc = await sampleFastItem(g.userId, { exclude: parseExclude(sp.get('exclude')), kind });
    return json({ item: doc ? await fastItemFor(doc, g.userId) : null, stats, needPractice: false, ...flags });
  } catch (e) {
    console.error('tzurat fast', e);
    return serverError();
  }
}

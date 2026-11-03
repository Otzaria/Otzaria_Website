import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { submitPage } from '@/lib/tzuratHadaf/submissions';
import { json, badRequest, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';
import { itemsPaused } from '@/lib/tzuratHadaf/pause';

// POST {checks, lineOps, itemAnswers, manualItems, reports, note, round?} ← {submission: id, points: 0}.
// תפיסת מקום אטומית (עמוד כפול — שני מקומות); העוגנים נגזרים בשרת מ-lineOps (lineOps.deriveAnchors).
export async function POST(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const { id } = await params;
    const { body, tooBig } = await readJsonBody(request);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    // כשהשאלות מושהות — תשובות לשאלות (מדף שנפתח לפני ההשהיה) אינן נשמרות; השורות והדיווחים כן
    const r = await submitPage(id, g.user, itemsPaused() ? { ...body, itemAnswers: [] } : body);
    if (!r.ok) return fromResult(r);
    return json({ submission: r.submission, points: r.points, warnings: r.warnings || [] });
  } catch (e) {
    console.error('tzurat submit', e);
    return serverError();
  }
}

import { adminGate, ok, fail, validId, crash } from '../../../_lib/http';
import { listCorrections, CORRECTIONS_KEEP } from '@/lib/trainingProof/corrections';
import { SECTIONS } from '@/lib/trainingProof/vocab';

// GET [?section=ocr|router|frames] ← {items, keep} — התיקונים שהמנהל עשה בסימונים של המתנדב,
// החדשים קודם ("הצג תיקונים" בלשונית המתנדבים). נשמרים גם אחרי שהפריטים ירדו לתחנה ונמחקו.
export async function GET(request, { params }) {
  const { error } = await adminGate();
  if (error) return error;
  const { userId } = await params;
  if (!validId(userId)) return fail(400, 'מזהה לא תקין');
  const s = new URL(request.url).searchParams.get('section');
  if (s && !SECTIONS.includes(s)) return fail(400, 'חלק לא מוכר');
  try {
    return ok({ items: await listCorrections(userId, { section: s || null }), keep: CORRECTIONS_KEEP });
  } catch (e) {
    return crash('volunteer corrections', e);
  }
}

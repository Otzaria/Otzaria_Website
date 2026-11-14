import { MAX_FILE_BYTES } from '@/lib/trainingProof/vocab';
import { adminGate, ok, fail, sectionOf, crash } from '../_lib/http';
import { stage } from '../_lib/ingest';

// בדיקה אחת של קובץ ZIP אפשר להריץ בזמן סביר; הקליטה עצמה — במנות (upload/[token])
export const maxDuration = 60;

// POST multipart: file (ZIP אחד), section (החלק של הכרטיס) ←
//   {token, section, manifest, read, existing, proofed, warnings, total, newPackage}
// הבדיקה המלאה (zipCheck) — לפני שנכתב דבר. קובץ של חלק אחר ← 400 עם wrongSection.
// אין בחירת מסלול (ה-12): כל פריט נושא את הספר והמסלול שלו.
export async function POST(request) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const len = Number(request.headers.get('content-length'));
  if (Number.isFinite(len) && len > MAX_FILE_BYTES + 1024 * 1024) {
    return fail(413, `הקובץ גדול מ-${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB — התחנה מפצלת לכמה קבצים`);
  }
  try {
    const form = await request.formData();
    const section = sectionOf(form.get('section'));
    const file = form.get('file');
    if (!section) return fail(400, 'חלק לא מוכר');
    if (!file || typeof file.arrayBuffer !== 'function') return fail(400, 'לא נבחר קובץ');
    if (!/\.zip$/i.test(file.name || '')) return fail(400, 'יש להעלות קובץ ZIP');
    const r = await stage(new Uint8Array(await file.arrayBuffer()), { expectSection: section, userId, fileName: file.name });
    if (r.error) return fail(400, r.error, { errors: r.errors || [r.error], wrongSection: r.wrongSection || null });
    return ok(r);
  } catch (e) {
    return crash('upload', e, 'ההעלאה נכשלה');
  }
}

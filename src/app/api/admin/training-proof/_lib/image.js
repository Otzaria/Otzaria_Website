import TrainingProofItem from '@/models/TrainingProofItem';
import { readPageImage } from '@/lib/ocr/images';
import { adminGate, fail, validId, crash } from './http';

// תמונה של פריט למסך הניהול (השורה/העמוד — imagePath, או העמוד המלא — ctxPath).
// התמונות אינן נכס סטטי; כאן — רק מנהל OCR, לכל פריט, בלי תלות במי שתפס אותו.
export async function serveAdminImage(params, field) {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const { id } = await params;
    if (!validId(id)) return fail(400, 'מזהה לא תקין');
    const item = await TrainingProofItem.findById(id, { [field]: 1 }).lean();
    if (!item?.[field]) return fail(404, 'התמונה לא נמצאה');
    const { buffer, mimeType } = await readPageImage(item[field]);
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        // אותו מזהה = אותה תמונה (העלאה חוזרת אינה דורסת פריט)
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (e) {
    if (e?.code === 'ENOENT') return fail(404, 'התמונה לא נמצאה');
    return crash('image', e, 'טעינת התמונה נכשלה');
  }
}

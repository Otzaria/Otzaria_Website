import mongoose from 'mongoose';
import TrainingProofItem from '@/models/TrainingProofItem';
import { readPageImage } from '@/lib/ocr/images';
import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { fail } from '@/lib/trainingProof/routeUtils';

// הגשת תמונה של פריט (השורה, או העמוד המלא — ctx). רק למי שהשורה בסבב שלו, או למנהל:
// התמונות לא נגישות כנכס סטטי, ומתנדב לא "מדפדף" בתמונות של אחרים לפי מזהה.
// field — 'imagePath' או 'ctxPath'.
export async function serveItemImage(params, field) {
  const { userId, isAdmin, error } = await requireTrainingProofSession();
  if (error) return error;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return fail(400, 'מזהה לא תקין');
    const item = await TrainingProofItem.findById(id, { [field]: 1, heldBy: 1 }).lean();
    if (!item || !item[field]) return fail(404, 'התמונה לא נמצאה');
    if (!isAdmin && String(item.heldBy) !== userId) return fail(403, 'השורה הזו אינה בסבב שלך');
    const { buffer, mimeType } = await readPageImage(item[field]);
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        // התמונה של פריט לעולם אינה מתחלפת באותו מזהה (העלאה חוזרת לא דורסת פריט קיים)
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (e) {
    if (e?.code === 'ENOENT') return fail(404, 'התמונה לא נמצאה');
    console.error('training-proof image', e);
    return fail(500, 'טעינת התמונה נכשלה');
  }
}

import TrainingProofPackage from '@/models/TrainingProofPackage';
import TrainingProofItem from '@/models/TrainingProofItem';
import { PACKAGE_ID_RE } from '@/lib/trainingProof/vocab';
import { adminGate, ok, fail, jsonBody, crash } from '../../../_lib/http';
import { deleteMatchingItems, dropEmptyPackages, dropEmptyBooks } from '../../../_lib/files';
import { archiveDelta, applyArchive } from '@/lib/trainingProof/stats';

// חבילה אחת (package_id + part) בטבלת החבילות.
// PATCH {open} — השהה/פתח למתנדבים. פריטים שכבר בידי מתנדב נשארים אצלו.
// DELETE — מחיקה: הפריטים שעוד לא הוגו (פנויים, וגם אלה שבסבב פתוח של מתנדב) נמחקים
//   עם התמונות שלהם. מה שכבר הוגה (ממתין לאישור או אושר) נשאר לסקירה ולהורדה, והחבילה
//   נשארת מושהית; חבילה שלא נשאר בה דבר נמחקת כולה. דחיות של מתנדבים בשורות שנמחקו
//   נשמרות במונים שלהם (lib/trainingProof/stats). ← {deleted, kept, dropped}

async function keyOf(params) {
  const { packageId, part } = await params;
  const p = Number(part);
  if (!PACKAGE_ID_RE.test(String(packageId)) || !Number.isInteger(p) || p < 1) return null;
  return { packageId: String(packageId), part: p };
}

export async function PATCH(request, { params }) {
  const { error } = await adminGate();
  if (error) return error;
  const key = await keyOf(params);
  if (!key) return fail(400, 'חבילה לא תקינה');
  const { body, error: bad } = await jsonBody(request);
  if (bad) return bad;
  if (typeof body.open !== 'boolean') return fail(400, 'חסר open');
  try {
    const res = await TrainingProofPackage.updateOne(key, { $set: { open: body.open } });
    if (!res.matchedCount) return fail(404, 'החבילה לא נמצאה');
    return ok({ open: body.open });
  } catch (e) {
    return crash('package patch', e);
  }
}

export async function DELETE(_request, { params }) {
  const { error } = await adminGate();
  if (error) return error;
  const key = await keyOf(params);
  if (!key) return fail(400, 'חבילה לא תקינה');
  try {
    if (!(await TrainingProofPackage.exists(key))) return fail(404, 'החבילה לא נמצאה');
    const gone = { ...key, status: { $in: ['available', 'held'] } };
    const { deleted: docs } = await deleteMatchingItems(gone, {
      imagePath: 1, ctxPath: 1, book: 1, section: 1, status: 1, vol: 1, adminFixed: 1, rejectedFor: 1,
    });
    // שורה פנויה יכולה לשאת דחייה של מתנדב קודם — היא נשמרת במונים שלו
    await applyArchive(archiveDelta(docs));
    const kept = await TrainingProofItem.countDocuments(key);
    if (kept) await TrainingProofPackage.updateOne(key, { $set: { open: false } });
    const dropped = await dropEmptyPackages([key]);
    await dropEmptyBooks(docs.filter((d) => d.section === 'frames').map((d) => d.book));
    return ok({ deleted: docs.length, kept, dropped: dropped.length > 0 });
  } catch (e) {
    return crash('package delete', e, 'המחיקה נכשלה');
  }
}

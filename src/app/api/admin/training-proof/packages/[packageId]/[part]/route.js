import TrainingProofPackage from '@/models/TrainingProofPackage';
import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofPackagePurge from '@/models/TrainingProofPackagePurge';
import { PACKAGE_ID_RE } from '@/lib/trainingProof/vocab';
import { adminGate, ok, fail, jsonBody, crash } from '../../../_lib/http';
import { deleteMatchingItems, removeItemFiles, dropEmptyPackages, dropEmptyBooks } from '../../../_lib/files';
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
    const gone = { ...key, status: { $in: ['available', 'held'] } };
    const projection = {
      imagePath: 1, ctxPath: 1, book: 1, section: 1, status: 1, vol: 1, adminFixed: 1, rejectedFor: 1,
    };
    let purge = await TrainingProofPackagePurge.findOne(key).select('+cleanup').lean();
    if (!purge) {
      if (!(await TrainingProofPackage.exists(key))) return fail(404, 'החבילה לא נמצאה');
      const cleanup = await TrainingProofItem.find(gone, projection).lean();
      try {
        purge = (await TrainingProofPackagePurge.create({ ...key, cleanup })).toObject();
      } catch (e) {
        if (e?.code !== 11000) throw e;
        purge = await TrainingProofPackagePurge.findOne(key).select('+cleanup').lean();
      }
    }
    if (purge.status === 'complete') {
      // אם פריט שהיה בתנועה בזמן המחיקה חזר אחר-כך למאגר, זו פעולת מחיקה חדשה.
      if (await TrainingProofItem.exists(gone)) {
        await TrainingProofPackagePurge.deleteOne({ _id: purge._id, status: 'complete' });
        return DELETE(_request, { params });
      }
      return ok({ deleted: purge.deleted, kept: purge.kept, dropped: purge.dropped });
    }

    const snapshot = purge.cleanup || [];
    const ids = snapshot.map((d) => d._id);
    await deleteMatchingItems({ ...gone, _id: { $in: ids } }, projection, { removeFiles: false });
    const remaining = new Set(
      (await TrainingProofItem.find({ _id: { $in: ids } }, { _id: 1 }).lean()).map((d) => String(d._id))
    );
    const docs = snapshot.filter((d) => !remaining.has(String(d._id)));
    // שורה פנויה יכולה לשאת דחייה של מתנדב קודם. מזהה הפעולה מונע ספירה כפולה ב-retry.
    await applyArchive(archiveDelta(docs), `package-purge:${purge.operationId}`);
    await removeItemFiles(docs);
    const kept = await TrainingProofItem.countDocuments(key);
    if (kept) await TrainingProofPackage.updateOne(key, { $set: { open: false } });
    const dropped = await dropEmptyPackages([key]);
    await dropEmptyBooks(docs.filter((d) => d.section === 'frames').map((d) => d.book));
    const result = { deleted: docs.length, kept, dropped: dropped.length > 0 };
    await TrainingProofPackagePurge.updateOne(
      { ...key, status: 'purging' },
      { $set: { status: 'complete', ...result }, $unset: { cleanup: 1 } }
    );
    return ok(result);
  } catch (e) {
    return crash('package delete', e, 'המחיקה נכשלה');
  }
}

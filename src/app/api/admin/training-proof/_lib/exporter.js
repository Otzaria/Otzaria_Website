import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofPackage from '@/models/TrainingProofPackage';
import TrainingProofExportLog from '@/models/TrainingProofExportLog';
import TrainingProofBook from '@/models/TrainingProofBook';
import TrainingProofExportLock from '@/models/TrainingProofExportLock';
import { buildReturnZip, newExportId } from '@/lib/trainingProof/returnFile';
import { archiveDelta, applyArchive } from '@/lib/trainingProof/stats';
import { syncCorrections } from '@/lib/trainingProof/corrections';
import { oid } from './http';
import { deleteMatchingItems, removeItemFiles, dropEmptyPackages, dropEmptyBooks } from './files';

// ההורדה לתחנה (docs/75 ה-13; docs/76 §5, §8.2): ZIP של כל מה שאושר בחלק אחד, בנוי
// ב-returnFile. החומר נמחק מהאתר **רק אחרי שהשרת סיים לשלוח את הקובץ** — הזרם
// (ReadableStream) מוסר את הקובץ במנות לפי קצב הקריאה, וה-close מגיע רק כשהמנה האחרונה
// כבר נלקחה. דפדפן שניתק באמצע ← cancel ← שום דבר לא נמחק.
// ההורדה של חלק אחד רצה פעם אחת בכל זמן נתון (busy).

const CHUNK = 64 * 1024;
const LOCK_MS = 60 * 60 * 1000;
const busy = new Set();
// section → Promise של המחיקה שאחרי ההורדה האחרונה (לבדיקות, ולמי שרוצה לחכות לה)
export const purges = new Map();

export const isBusy = (section) => busy.has(section);

async function acquireLock(section, exportId, now = new Date()) {
  try {
    await TrainingProofExportLock.findOneAndUpdate(
      { section, $or: [{ expiresAt: { $lte: now } }, { exportId }] },
      { $set: { exportId, expiresAt: new Date(now.getTime() + LOCK_MS) } },
      { upsert: true, returnDocument: 'after' }
    );
    return true;
  } catch (e) {
    if (e?.code === 11000) return false;
    throw e;
  }
}

async function releaseLock(section, exportId) {
  await TrainingProofExportLock.deleteOne({ section, exportId }).catch(() => {});
}

// מה ממתין להורדה בחלק — למסך ההורדה. פילוח לפי כתב/פעולה (זיהוי), כתב (נתב), ספרים (גלאי)
export async function pendingSummary(section) {
  const match = { section, status: 'approved' };
  const [count, a, b] = await Promise.all([
    TrainingProofItem.countDocuments(match),
    section === 'frames'
      ? TrainingProofItem.aggregate([{ $match: match }, { $group: { _id: '$book', n: { $sum: 1 }, alias: { $first: '$payload.alias' } } }])
      : TrainingProofItem.aggregate([{ $match: match }, { $group: { _id: section === 'ocr' ? '$track' : '$result.label', n: { $sum: 1 } } }]),
    section === 'ocr'
      ? TrainingProofItem.aggregate([{ $match: match }, { $group: { _id: '$result.action', n: { $sum: 1 } } }])
      : section === 'router'
        ? TrainingProofItem.aggregate([{ $match: match }, { $group: { _id: '$result.bad', n: { $sum: 1 } } }])
        : TrainingProofItem.aggregate([{ $match: match }, { $group: { _id: '$result.status', n: { $sum: 1 } } }]),
  ]);
  const toObj = (rows) => Object.fromEntries(rows.map((r) => [String(r._id ?? ''), r.n]));
  if (section === 'frames') {
    // הכינוי של ספר-גלאי שמור ברשומת הספר (books.json), לא בכל עמוד
    const books = await TrainingProofBook.find({ book: { $in: a.map((r) => r._id) } }, { book: 1, alias: 1 }).lean();
    const alias = new Map(books.map((x) => [x.book, x.alias]));
    return { count, books: a.map((r) => ({ alias: r.alias || alias.get(r._id) || r._id, pages: r.n })), byStatus: toObj(b) };
  }
  if (section === 'router') return { count, byLabel: toObj(a), bad: toObj(b).true || 0 };
  return { count, byTrack: toObj(a), byAction: toObj(b) };
}

// אחרי שהקובץ נשלח: נשמר snapshot בר-שחזור ביומן, הפריטים נמחקים בתנאי שהם עדיין
// מאושרים, ואז המונים והקבצים מנוקים באופן idempotent. כשל באמצע מושלם לפני הייצוא הבא.
export async function purgeExported({ section, exportId, ids, packages, by }) {
  // הפריט הוא ה-outbox של יומן התיקונים. אסור למחוק אותו לפני שהרשומה העצמאית
  // נשמרה; אם Mongo נכשל כאן, מנגנון שחזור ה-purge ינסה שוב בפעם הבאה.
  const corrections = await TrainingProofItem.find({
    _id: { $in: ids }, section, status: 'approved', adminFixed: true,
  }).lean();
  await syncCorrections(corrections);
  const projection = { section: 1, status: 1, vol: 1, adminFixed: 1, rejectedFor: 1, imagePath: 1, ctxPath: 1, packageId: 1, part: 1, book: 1 };
  let log = await TrainingProofExportLog.findOne({ exportId }).select('+cleanup').lean();
  if (!log) {
    const docs = await TrainingProofItem.find({ _id: { $in: ids }, section, status: 'approved' }, projection).lean();
    try {
      log = await TrainingProofExportLog.create({
        exportId,
        section,
        count: ids.length,
        packages,
        at: new Date(),
        by: by ? oid(by) : null,
        status: 'purging',
        cleanup: docs,
      });
      log = log.toObject();
    } catch (e) {
      if (e?.code !== 11000) throw e;
      log = await TrainingProofExportLog.findOne({ exportId }).select('+cleanup').lean();
    }
  }
  if (log.status === 'complete') return { deleted: log.count, files: 0, packages: 0, books: 0 };
  const snapshot = log.cleanup || [];
  const snapshotIds = snapshot.map((d) => d._id);
  await deleteMatchingItems({ _id: { $in: snapshotIds }, section, status: 'approved' }, projection, { removeFiles: false });
  const remaining = new Set(
    (await TrainingProofItem.find({ _id: { $in: snapshotIds } }, { _id: 1 }).lean()).map((d) => String(d._id))
  );
  const deleted = snapshot.filter((d) => !remaining.has(String(d._id)));
  await applyArchive(archiveDelta(deleted), exportId);
  const files = await removeItemFiles(deleted);
  const dropped = await dropEmptyPackages(deleted.map((d) => ({ packageId: d.packageId, part: d.part })));
  const books = section === 'frames' ? await dropEmptyBooks(deleted.map((d) => d.book)) : 0;
  await TrainingProofExportLog.updateOne({ exportId }, { $set: { status: 'complete', count: deleted.length }, $unset: { cleanup: 1 } });
  return { deleted: deleted.length, files, packages: dropped.length, books };
}

async function recoverPurges(section) {
  const logs = await TrainingProofExportLog.find({ section, status: 'purging' }).select('+cleanup').lean();
  for (const log of logs) {
    await purgeExported({
      section,
      exportId: log.exportId,
      ids: (log.cleanup || []).map((d) => d._id),
      packages: log.packages || [],
      by: log.by,
    });
  }
}

// בונה את הקובץ. מחזיר {error} או {exportId, count, bytes, stream}
export async function startExport(section, by) {
  if (busy.has(section)) return { error: 'הורדה של החלק הזה כבר רצה — חכו שתסתיים', status: 409 };
  busy.add(section);
  const exportId = newExportId();
  try {
    if (!(await acquireLock(section, exportId))) {
      busy.delete(section);
      return { error: 'הורדה של החלק הזה כבר רצה — חכו שתסתיים', status: 409 };
    }
    await recoverPurges(section);
    const items = await TrainingProofItem.find({ section, status: 'approved' }).sort({ packageId: 1, uid: 1 }).lean();
    if (!items.length) {
      busy.delete(section);
      await releaseLock(section, exportId);
      return { error: 'אין כרגע חומר מאושר להורדה בחלק הזה', status: 409 };
    }
    const packages = [...new Set(items.map((it) => it.packageId))];
    const pk = await TrainingProofPackage.find({ packageId: { $in: packages } }, { packageId: 1, stationId: 1 }).lean();
    const stations = new Map(pk.map((p) => [p.packageId, p.stationId]));
    const { bytes, manifest } = buildReturnZip(section, items, { stationOf: (p) => stations.get(p), exportId });
    const ids = items.map((it) => it._id);
    let off = 0;
    let settled = false;
    const release = async () => {
      settled = true;
      busy.delete(section);
      await releaseLock(section, exportId);
    };
    const stream = new ReadableStream(
      {
        pull(controller) {
          if (off < bytes.length) {
            controller.enqueue(bytes.subarray(off, off + CHUNK));
            off += CHUNK;
            return;
          }
          controller.close();
          if (settled) return;
          // המנה האחרונה נלקחה — עכשיו (ורק עכשיו) מוחקים
          const p = purgeExported({ section, exportId, ids, packages, by })
            .catch((e) => {
              console.error('training-proof export purge', exportId, e?.message || e);
              return { error: true };
            })
            .finally(() => release());
          purges.set(section, p);
        },
        async cancel() {
          // הדפדפן ניתק באמצע — שום דבר לא נמחק
          await release();
        },
      },
      { highWaterMark: 0 }
    );
    return { exportId, count: manifest.counts.items, bytes, stream };
  } catch (e) {
    busy.delete(section);
    await releaseLock(section, exportId);
    throw e;
  }
}

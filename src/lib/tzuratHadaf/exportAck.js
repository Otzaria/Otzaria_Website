import TzuratExportJob from '../../models/TzuratExportJob.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import { isObjectId } from './common.js';

export async function acknowledgeExport(exportId, now = new Date()) {
  if (!isObjectId(String(exportId))) return { ok: false, status: 400, error: 'מזהה הייצוא אינו תקין' };
  const job = await TzuratExportJob.findOne({
    _id: exportId,
    status: { $in: ['ready', 'acked'] },
    expiresAt: { $gt: now },
  }).lean();
  if (!job) return { ok: false, status: 400, error: 'הייצוא לא נמצא או טרם הושלם' };
  if (job.status === 'ready' && job.submissions.length) {
    await TzuratSubmission.updateMany(
      { _id: { $in: job.submissions }, status: 'approved', reviewAction: null, exportedAt: null },
      { $set: { exportedAt: now } },
      { timestamps: false }
    );
  }
  await TzuratExportJob.updateOne(
    { _id: job._id, status: 'ready' },
    { $set: { status: 'acked', ackedAt: now } }
  );
  return { ok: true };
}

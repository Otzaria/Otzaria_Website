import TrainingProofExportLog from '@/models/TrainingProofExportLog';
import { SECTIONS } from '@/lib/trainingProof/vocab';
import { adminGate, ok, crash } from '../_lib/http';
import { pendingSummary, isBusy } from '../_lib/exporter';
import { namesOf } from '../_lib/review';

// GET ← {sections:{ocr:{count, byTrack, byAction, busy}, router:{…}, frames:{…}}, log:[{exportId, section, count, at, by}]}
// מסך ההורדה: כמה אושר ועוד לא ירד בכל חלק, ויומן ההורדות (החומר עצמו כבר נמחק — ה-13).
export async function GET() {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const [rows, log] = await Promise.all([
      Promise.all(SECTIONS.map((s) => pendingSummary(s))),
      TrainingProofExportLog.find({}).sort({ at: -1 }).limit(100).lean(),
    ]);
    const names = await namesOf(log.map((l) => l.by));
    return ok({
      sections: Object.fromEntries(SECTIONS.map((s, i) => [s, { ...rows[i], busy: isBusy(s) }])),
      log: log.map((l) => ({ exportId: l.exportId, section: l.section, count: l.count, at: l.at, by: l.by ? names.get(String(l.by)) || '' : '' })),
    });
  } catch (e) {
    return crash('export summary', e);
  }
}

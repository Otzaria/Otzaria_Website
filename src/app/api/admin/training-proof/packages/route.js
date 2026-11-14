import TrainingProofPackage from '@/models/TrainingProofPackage';
import TrainingProofItem from '@/models/TrainingProofItem';
import { adminGate, ok, crash } from '../_lib/http';

// GET ← {packages:[{packageId, part, parts, section, label, note, open, uploadedAt, createdAt,
//   read:{items, by_track}, counts:{available, held, submitted, approved, total}}]}
// טבלת החבילות במסך ההעלאה: מה נקרא מהקובץ, וכמה מכל חבילה כבר הוגה (= לא פנוי ולא אצל מתנדב).
export async function GET() {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const [pkgs, groups] = await Promise.all([
      TrainingProofPackage.find({}).sort({ uploadedAt: -1 }).lean(),
      TrainingProofItem.aggregate([{ $group: { _id: { p: '$packageId', part: '$part', st: '$status' }, n: { $sum: 1 } } }]),
    ]);
    const counts = new Map();
    for (const g of groups) {
      const k = `${g._id.p}#${g._id.part}`;
      if (!counts.has(k)) counts.set(k, { available: 0, held: 0, submitted: 0, approved: 0, total: 0 });
      const c = counts.get(k);
      if (g._id.st in c) c[g._id.st] += g.n;
      c.total += g.n;
    }
    return ok({
      packages: pkgs.map((p) => ({
        packageId: p.packageId,
        part: p.part,
        parts: p.parts,
        section: p.section,
        label: p.label || '',
        note: p.note || '',
        open: !!p.open,
        uploadedAt: p.uploadedAt,
        createdAt: p.createdAt,
        read: p.counts?.read || { items: p.counts?.items || 0, by_track: p.counts?.by_track || {} },
        counts: counts.get(`${p.packageId}#${p.part}`) || { available: 0, held: 0, submitted: 0, approved: 0, total: 0 },
      })),
    });
  } catch (e) {
    return crash('packages', e);
  }
}

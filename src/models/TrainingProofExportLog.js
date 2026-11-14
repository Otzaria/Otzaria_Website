import mongoose from 'mongoose';
import { SECTIONS } from '../lib/trainingProof/vocab.js';

// יומן ההורדות לתחנה (docs/75 ה-13; docs/76 §5, §8.1). החומר עצמו נמחק מהאתר
// אחרי שההורדה הסתיימה — נשאר רק כמה ירד ומתי.
const TrainingProofExportLogSchema = new mongoose.Schema(
  {
    exportId: { type: String, required: true, unique: true },
    section: { type: String, enum: SECTIONS, required: true },
    count: { type: Number, default: 0 },
    packages: { type: [String], default: [] },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['purging', 'complete'], default: 'complete', index: true },
    // Internal recovery snapshot. Removed once cleanup completes.
    cleanup: { type: [mongoose.Schema.Types.Mixed], default: undefined, select: false },
  },
  { timestamps: false }
);

export default mongoose.models.TrainingProofExportLog ||
  mongoose.model('TrainingProofExportLog', TrainingProofExportLogSchema);

import mongoose from 'mongoose';

// יומן מחיקה של חלק מחבילה. ה-snapshot נשמר לפני מחיקת הפריטים, כדי שכשל אחרי
// המחיקה ולפני ארכוב המונים יהיה ניתן להשלמה בבקשה הבאה (MongoDB standalone).
const TrainingProofPackagePurgeSchema = new mongoose.Schema(
  {
    packageId: { type: String, required: true },
    part: { type: Number, required: true },
    operationId: { type: String, required: true, default: () => new mongoose.Types.ObjectId().toString() },
    status: { type: String, enum: ['purging', 'complete'], default: 'purging' },
    cleanup: { type: mongoose.Schema.Types.Mixed, default: [], select: false },
    deleted: { type: Number, default: 0 },
    kept: { type: Number, default: 0 },
    dropped: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TrainingProofPackagePurgeSchema.index({ packageId: 1, part: 1 }, { unique: true });

export default mongoose.models.TrainingProofPackagePurge ||
  mongoose.model('TrainingProofPackagePurge', TrainingProofPackagePurgeSchema);

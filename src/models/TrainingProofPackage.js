import mongoose from 'mongoose';
import { SECTIONS } from '../lib/trainingProof/vocab.js';

// חבילה בהגהה לאימון: קובץ ZIP אחד שהועלה מתחנת-האימון (docs/76 §3, §8.1).
// ייצוא אחד מהתחנה יכול להתפצל לכמה קבצים (part/parts) — כל קובץ = מסמך כאן,
// ולכן המפתח הייחודי הוא (packageId, part). העלאה חוזרת של אותו קובץ אינה יוצרת
// מסמך שני. אין כאן שם של ספר — label הוא שם חופשי שבעל הפרויקט נתן בייצוא.
const TrainingProofPackageSchema = new mongoose.Schema(
  {
    packageId: { type: String, required: true },
    part: { type: Number, required: true, min: 1 },
    parts: { type: Number, default: 1, min: 1 },
    section: { type: String, enum: SECTIONS, required: true, index: true },
    label: { type: String, default: '' },
    note: { type: String, default: '' },
    stationId: { type: String, required: true },
    // counts.items + counts.by_track כפי שהגיעו ב-manifest, ומה שנספר בפועל בקליטה
    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    // פתוח למתנדבים (true) / מושהה (false). פריטים שכבר בידי מתנדב — נשארים אצלו
    open: { type: Boolean, default: true, index: true },
    createdAt: { type: Date }, // created_at של הייצוא בתחנה
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: false }
);

TrainingProofPackageSchema.index({ packageId: 1, part: 1 }, { unique: true });

export default mongoose.models.TrainingProofPackage ||
  mongoose.model('TrainingProofPackage', TrainingProofPackageSchema);

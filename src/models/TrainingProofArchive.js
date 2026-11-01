import mongoose from 'mongoose';

// המונים של מגיה על פריטים שכבר נמחקו מהאתר (הורדה לתחנה — ה-13; מחיקת חבילה), לפי משתמש.
// רשומה נפרדת מ-TrainingProofVolunteer: גם מנהל OCR מגיה, ואין לו רשומת-מגיה (accessRules —
// הגישה שלו מהתפקיד). רשומה כאן לא נותנת גישה ולא מופיעה ברשימת המגיהים.
// stats — {ocr|router|frames: {approved, unchanged, rejected}}.
const TrainingProofArchiveSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Export ids already credited into stats — keeps retrying a purge idempotent.
    exports: { type: [String], default: [], select: false },
  },
  { timestamps: false, minimize: false }
);

export default mongoose.models.TrainingProofArchive ||
  mongoose.model('TrainingProofArchive', TrainingProofArchiveSchema);

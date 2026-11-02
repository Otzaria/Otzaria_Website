import mongoose from 'mongoose';

// ספר בגלאי האזורים (רק לחלק frames, docs/76 §4.3, §8.1–§8.2). book = המפתח האטום
// מהתחנה (b-…), alias = "ספר N". עמודי ספר אחד יכולים להגיע בכמה קבצים — כאן הם
// מתאחדים. הספר נלקח בשלמותו בידי מתנדב אחד ל-48 שעות; בשחרור או כשהזמן עבר הוא
// חוזר לרשימה כ"הופסק באמצע" (lastBy), ומתנדב אחר רואה את מה שכבר סומן.
const TrainingProofBookSchema = new mongoose.Schema(
  {
    book: { type: String, required: true, unique: true },
    alias: { type: String, default: '' },
    kind: { type: String, default: null }, // scan / digital
    // [{id, name, role}] — כולל זרמים שמתנדב הוסיף
    streams: { type: mongoose.Schema.Types.Mixed, default: [] },
    // פעולת שינוי סוג זרם שנמצאת בתהליך. הפעולה ניתנת לחזרה ומושלמת בבקשה
    // הבאה אם התהליך נעצר באמצע; ראו framesDb.settleStreamChange.
    streamChange: { type: mongoose.Schema.Types.Mixed, default: null },
    // מזהה פעולה שכבר בוצעה בספר אך נותר לנקות את סמניה מהעמודים.
    streamChangeCleanup: { type: String, default: null },
    pagesTotal: { type: Number, default: 0 },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    claimedUntil: { type: Date, default: null },
    lastBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

TrainingProofBookSchema.index({ claimedBy: 1, claimedUntil: 1 });

export default mongoose.models.TrainingProofBook || mongoose.model('TrainingProofBook', TrainingProofBookSchema);

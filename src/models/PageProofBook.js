import mongoose from 'mongoose';

// ספר בהגהת-עמודים: חבילת-עמודים שהפיקה תוכנת-הספר של פרויקט ה-OCR
// (חוזה-העמוד, docs/37 בחבילה שנמסרה). gid = המזהה הגלובלי הקבוע של הספר
// אצלם — חובה להחזיר אותו בקובץ-התיקונים, ולכן הוא המפתח הייחודי כאן.
// ייבוא-חוזר של אותו gid מוסיף/מעדכן עמודים ואינו יוצר ספר שני.
const PageProofBookSchema = new mongoose.Schema(
  {
    gid: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    // כתב-הספר (square/rashi) כפי שהגיע בחבילה — להצגה בלבד
    script: { type: String, default: null },

    // אחוז הרצפים שמתויגים בידי שני אנשים (למדידת הסכמה); נקבע בייבוא
    // הראשון ונשמר, כדי שייבוא-חוזר לא יחליף רצפים שכבר חולקו
    doublePct: { type: Number, default: 10, min: 0, max: 100 },

    // paused = לא מחולק למתנדבים (עמודים שכבר בידיהם — נשמרים)
    status: { type: String, enum: ['active', 'paused'], default: 'active', index: true },

    pageCount: { type: Number, default: 0 },
    lineCount: { type: Number, default: 0 },

    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastImportAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.PageProofBook || mongoose.model('PageProofBook', PageProofBookSchema);

import mongoose from 'mongoose';

// שורה בודדת לתמלול במאגר האימון של פרויקט ה-OCR (Hebrew OCR Engine).
// בשונה מ-OcrTrainingPage (שם המשתמש מסמן את השורות בעצמו), כאן השורות כבר
// מוגדרות במסד מראש: תמונת עמוד + תיבת מיקום בפיקסלים. המשתמש רק מקליד את
// הטקסט של החיתוך. הכנסת השורות למסד תמומש בהמשך (סקריפט/ניהול נפרד).

const OcrLineSchema = new mongoose.Schema(
  {
    // מקור השורה — לזיהוי, לקיבוץ בייצוא (מניעת דליפת ספר בין splits) ולתצוגת ניהול
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
    bookName: { type: String, default: '' },
    bookSlug: { type: String, default: '' },
    pageNumber: { type: Number, default: 0 },

    // תמונת העמוד המלאה (נתיב יחסי כמו ב-Page, למשל /uploads/books/<slug>/page.1.jpg)
    imagePath: { type: String, required: true },
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 },

    // תיבת השורה בפיקסלים של התמונה המקורית (natural pixels)
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },

    // סוג הכתב — קובע את צינור האימון בייצוא (square/rashi). ניתן להחלפה בניהול.
    scriptType: { type: String, enum: ['square', 'rashi'], default: 'square' },
    // הצעת שינוי כתב מהמתמלל — נשמרת רק כשהיא שונה מ-scriptType, עד הכרעת מנהל
    // (קבלה/דחייה). אישור שורה חסום כל עוד יש הצעה פתוחה.
    suggestedScriptType: { type: String, enum: ['square', 'rashi'] },

    status: {
      type: String,
      enum: ['available', 'submitted', 'approved'],
      default: 'available',
      index: true,
    },

    // "החכרה רכה": עד מתי השורה שמורה למשתמש שקיבל אותה בדף — לא תוצע לאחרים
    // בפרק זמן זה, כדי ששני משתמשים לא יתמללו אותה במקביל. אינה נועלת שמירה.
    leasedUntil: { type: Date },

    text: { type: String, default: '' },
    // טיוטת מכונה (OCR) לשורה זמינה: מוצגת למתמלל כנקודת פתיחה להגהה.
    // אינה משנה סטטוס — השורה נחשבת "תומללה" רק כשמשתמש שומר אותה בעצמו.
    prefillText: { type: String, default: '' },

    // זרימת ההגהות (proofread): שורות אי-הסכמה מפרויקט ה-OCR עם טיוטת מודל.
    // batch = מזהה האצווה; sourceKey = מפתח-המקור הייחודי (edition/page/line)
    // ל-upsert אידמפוטנטי ולחיבור ההכרעה חזרה לחיתוך המקורי באימון.
    batch: { type: String, index: true },
    sourceKey: { type: String, unique: true, sparse: true },
    // מטא מהצינור (conf, rank, reject_reason) — לא מוצג למתנדב
    meta: { type: mongoose.Schema.Types.Mixed },
    // דגל מתנדב: שורה לא-קריאה או חיתוך שגוי — יוצאת מהתור בלי אישור מנהל,
    // וחוזרת בייצוא כמשוב על הפילוח
    flagged: { type: String, enum: ['unreadable', 'bad_crop'] },
    flaggedByName: { type: String },
    transcribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transcribedByName: { type: String },
    transcribedAt: { type: Date },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.OcrLine || mongoose.model('OcrLine', OcrLineSchema);

import mongoose from 'mongoose';

// תוצאת OCR מקומי (ספק local) לעמוד אחד בעבודה אחת: נתוני הפריסה (layout v1), נתוני העזר
// (metadata) והאזהרות של העמוד, לצמיתות — כולל היסטוריה (רשומה לכל עבודה). לא לבלבל עם
// OcrLayoutPage (תיוג מבנה עמוד לאימון), שאינו קשור לעובד המקומי.
//
// הרשומה "הנוכחית" של עמוד נגזרת ואינה נשמרת: זו שה-job וה-resultSha256 שלה שווים ל-
// Page.lastOcrJobId ול-Page.lastOcrResultSha256 (נכתבים באותו $set עם הטקסט — בהחלה ובאימוץ
// התנגשות). כך אימוץ התנגשות הופך את ה-layout שלה לנוכחי בלי שום סנכרון.
//
// נכתבת פעם אחת בלבד (upsert עם $setOnInsert, מפתח job+page) לפני כתיבת העמוד/ההתנגשות, כך
// שקריסה ביניהן לא משאירה עמוד שמצביע על רשומה חסרה. JSON נשמר כמחרוזת בכוונה: מערכים מקוננים
// ב-BSON מנפחים בערך פי 2 (מפתחות "0","1",... לכל איבר), ומחרוזת חוסכת גם את מגבלות שמות
// המפתחות של Mongo. ניקוי: רק במחיקת ספר (src/app/api/admin/books/delete).
const WarningSchema = new mongoose.Schema({
  code: { type: String },
  message: { type: String },
  source: { type: String, enum: ['worker', 'site'] },
}, { _id: false });

const OcrPageResultSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'OcrJob', required: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  page: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true },
  pageNumber: { type: Number },
  pdfPageIndex: { type: Number },
  resultSha256: { type: String, required: true },
  outcome: { type: String },               // outcome של התוצאה כולה
  pipelineVersion: { type: String },       // storedPipelineVersion (מקוצר ומנוקה)
  imageSha256: { type: String },           // מה-pageMap — התמונה שנשלחה לעיבוד
  textSha256: { type: String },            // sha256 של pages[].text; null כשיש error
  hasText: { type: Boolean },              // התקבל טקסט לא ריק (בלי error)
  receivedAt: { type: Date },              // מועד הקליטה (now של הקליטה)
  metadataJson: { type: String },          // pages[].metadata כ-JSON (null מעל 64KiB)
  warnings: { type: [WarningSchema], default: undefined },
  layoutStatus: {
    type: String,
    enum: ['ok', 'absent', 'invalid', 'unsupported_version', 'too_large'],
    required: true,
  },
  layoutVersion: { type: Number },
  layoutJson: { type: String },            // רק ב-ok: ה-layout כמות שהוא (כולל שדות לא מוכרים)
  layoutBytes: { type: Number },
  layoutErrors: { type: [String], default: undefined },
  layoutRejectedJson: { type: String },    // invalid / unsupported_version — לבירור בלבד
}, { timestamps: true });

// רשומה אחת לכל עמוד בעבודה (upsert בשליחה חוזרת לא יוצר כפילות)
OcrPageResultSchema.index({ job: 1, page: 1 }, { unique: true });
// היסטוריית העמוד (מהחדשה לישנה)
OcrPageResultSchema.index({ page: 1, createdAt: -1 });
// מחיקת ספר
OcrPageResultSchema.index({ book: 1 });
// כל אינדקס שנוסף כאן חייב להיכנס גם ל-PAGE_RESULT_INDEXES (ocrJobMigration.js) — נבדק בטסט.

export default mongoose.models.OcrPageResult || mongoose.model('OcrPageResult', OcrPageResultSchema);

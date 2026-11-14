import mongoose from 'mongoose';

// התנגשות בהחלת תוצאת OCR מקומי (ספק local): טקסט OCR שלא נכתב לעמוד, ונשמר כאן להחלטת מנהל
// (החלה ידנית או דחייה). שתי סיבות (reason):
// - page_changed: העמוד השתנה אחרי יצירת העבודה (updatedAt שונה מ-expectedUpdatedAt ב-pageMap).
// - job_cancelled: העבודה בוטלה, והשירות שלח את העמודים שזוהו לפני הביטול. הם לא נכתבים לעמודים
//   (סמנטיקת הביטול נשמרת), אבל נשמרים כאן כדי שמנהל יוכל לאמץ אותם.
// אוסף נפרד ולא בתוך OcrJob —
// אלפיים עמודים של טקסט עלולים להתקרב למגבלת 16MB של מסמך יחיד.
const OcrConflictSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'OcrJob', required: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  page: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true },
  pageNumber: { type: Number },
  pdfPageIndex: { type: Number },
  reason: { type: String, enum: ['page_changed', 'job_cancelled'], default: 'page_changed' },
  ocrText: { type: String, default: '' },
  resultSha256: { type: String },
  expectedUpdatedAt: { type: Date },
  foundUpdatedAt: { type: Date },
  // applying — מצב ביניים של "אמץ OCR": ההכרעה נתפסה (open → applying) לפני כתיבת העמוד, כך
  // ש"שמור את הקיים" (מותנה ב-status:'open') כבר לא יכול לנצח. בסיום: applied, או חזרה ל-open
  // אם העמוד השתנה. קריסה באמצע — אחרי applyLeaseUntil מוכרע לפי סימון העמוד (ocrConflictResolve.js).
  status: { type: String, enum: ['open', 'applying', 'applied', 'dismissed'], default: 'open' },
  resolvedAt: { type: Date },
  resolvedByName: { type: String },
  applyToken: { type: String },
  // = lastOcrAt שנכתב לעמוד באימוץ הזה — הסימון שלפיו מזהים אחרי קריסה אם הכתיבה קרתה
  applyStartedAt: { type: Date },
  applyLeaseUntil: { type: Date },
  applyByName: { type: String },
  // updatedAt של העמוד שעליו מותנית כתיבת האימוץ — הכרעה אחרי lease שפג מקדמת אותו (חסימה)
  applyExpectedUpdatedAt: { type: Date },
}, { timestamps: true });

// התנגשות אחת לכל עמוד בעבודה (upsert בשליחה חוזרת לא יוצר כפילות)
OcrConflictSchema.index({ job: 1, page: 1 }, { unique: true });
OcrConflictSchema.index({ book: 1, status: 1 });
OcrConflictSchema.index({ book: 1, status: 1, pageNumber: 1, _id: 1 });

export default mongoose.models.OcrConflict || mongoose.model('OcrConflict', OcrConflictSchema);

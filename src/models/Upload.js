import mongoose from 'mongoose';

const UploadSchema = new mongoose.Schema({
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = העלאה אנונימית
  bookName: { type: String, required: true },
  originalFileName: { type: String },
  content: { type: Buffer }, // legacy: קבצים ישנים נשמרו ישירות במסמך
  // החלפת Buffer ב-GridFS reference
  fileStorageId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileStorage' }, // רפרנס לקובץ ב-GridFS
  fileSize: { type: Number }, // גודל הקובץ בבתים
  lineCount: { type: Number }, // מספר שורות
  uploadType: { type: String, enum: ['full_book', 'single_page', 'dicta'], default: 'single_page' }, // סוג ההעלאה
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  bookStatus: { type: String, default: 'not_checked' }, // סטטוס הספר: not_checked, needs_attention, ready, added_to_library
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false }, // האם הועבר לאשפה
  deletedAt: { type: Date }, // תאריך העברה לאשפה
  editCopy: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadEditCopy' }, // עותק עריכה מהעלאות
  editCopyCreatedAt: { type: Date }, // תאריך יצירת עותק העריכה
  // שדות מטא-דטה חדשים
  authorName: { type: String }, // שם המחבר
  bookCategory: { type: String }, // קטגוריית הספר
  authorCategory: { type: String }, // קטגוריית המחבר
  authorYear: { type: String }, // שנת המחבר
  publicationYear: { type: String }, // שנת הדפסת הספר
  copyrightHolder: { type: String }, // בעל הזכויות יוצרים
  sourceUrl: { type: String }, // מקור הספר (קישור לPDF ציבורי)
  isOcr: { type: Boolean, default: false }, // האם הטקסט הוא ע"י OCR
  ocrDescription: { type: String }, // תיאור שיטת ה-OCR
}, { timestamps: true });

export default mongoose.models.Upload || mongoose.model('Upload', UploadSchema);

import mongoose from 'mongoose';

const UploadSchema = new mongoose.Schema({
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = העלאה אנונימית
  bookName: { type: String, required: true },
  originalFileName: { type: String },
  content: { type: Buffer }, // תוכן הקובץ כ-Buffer (תומך בכל סוג קובץ)
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
}, { timestamps: true });

export default mongoose.models.Upload || mongoose.model('Upload', UploadSchema);
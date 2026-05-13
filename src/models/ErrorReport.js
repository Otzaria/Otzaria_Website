import mongoose from 'mongoose';

const ErrorReportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true }, // מזהה ייחודי לדיווח
  senderEmail: { type: String, required: true }, // כתובת השולח
  subject: { type: String, required: true }, // נושא הדיווח
  bookTitle: { type: String, required: true }, // שם הספר
  currentRef: { type: String, required: true }, // מיקום בספר
  lineNumber: { type: Number, required: true }, // מספר שורה
  selectedText: { type: String, required: true }, // הטקסט המסומן
  errorDetails: { type: String, required: true }, // פירוט הטעות
  contextText: { type: String, required: true }, // טקסט הקשר
  filePath: { type: String, required: true }, // נתיב הקובץ
  sourceFolder: { type: String, required: true }, // תיקיית המקור
  libraryVersion: { type: String, default: 'unknown' }, // גרסת ספרייה של המשתמש
  status: { 
    type: String, 
    enum: ['pending', 'in_progress', 'resolved', 'rejected'], 
    default: 'pending' 
  }, // סטטוס הטיפול בדיווח
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // למי הוקצה הדיווח
  adminNotes: { type: String }, // הערות מנהל
  resolvedAt: { type: Date }, // תאריך פתרון
  emailSent: { type: Boolean, default: false }, // האם נשלח מייל
  emailSentAt: { type: Date }, // תאריך שליחת המייל
}, { timestamps: true });

// אינדקס לחיפוש מהיר (reportId מקבל אינדקס אוטומטית דרך unique: true בהגדרת השדה)
ErrorReportSchema.index({ senderEmail: 1 });
ErrorReportSchema.index({ bookTitle: 1 });
ErrorReportSchema.index({ status: 1 });
ErrorReportSchema.index({ createdAt: -1 });

export default mongoose.models.ErrorReport || mongoose.model('ErrorReport', ErrorReportSchema);
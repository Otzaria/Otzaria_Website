import mongoose from 'mongoose';

// עבודת OCR על ספר שלם, רצה ברקע בשרת. הנהלת הספרים מתחילה עבודה,
// יכולה לעזוב את החלון, ולחזור מאוחר יותר לראות את ההתקדמות (polling על status).
const OcrJobSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  bookName: { type: String, default: '' },
  bookSlug: { type: String, default: '' },

  method: { type: String, enum: ['gemini', 'ocrwin'], required: true },
  model: { type: String, default: '' },            // ל-gemini בלבד
  existingTextMode: { type: String, enum: ['overwrite', 'skip'], default: 'skip' },
  splitColumns: { type: Boolean, default: false }, // חיתוך כל עמוד ל-2 טורים (ימין/שמאל) לפני OCR

  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'cancelled'],
    default: 'running',
    index: true,
  },

  totalPages: { type: Number, default: 0 },         // כמה עמודים בפועל יעובדו
  processedPages: { type: Number, default: 0 },
  successPages: { type: Number, default: 0 },
  failedPages: { type: Number, default: 0 },
  editedPagesCount: { type: Number, default: 0 },   // כמה עמודים כבר היה בהם טקסט (לתצוגה)
  currentPageNumber: { type: Number, default: 0 },

  cancelRequested: { type: Boolean, default: false },
  error: { type: String, default: '' },             // שגיאה כללית שעצרה את כל העבודה
  pageErrors: [{ pageNumber: Number, message: String }], // שגיאות נקודתיות לעמודים

  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  startedByName: { type: String, default: '' },
  finishedAt: { type: Date },
}, { timestamps: true });

// שליפה מהירה של העבודה האחרונה / הפעילה לכל ספר
OcrJobSchema.index({ book: 1, createdAt: -1 });

// מבטיח עבודה פעילה אחת בלבד לכל ספר ברמת ה-DB (מונע race בין שתי בקשות start).
// אינדקס חלקי - חל רק על רשומות במצב 'running', כך שעבודות שהסתיימו לא חוסמות חדשות.
OcrJobSchema.index(
  { book: 1 },
  { unique: true, partialFilterExpression: { status: 'running' } }
);

export default mongoose.models.OcrJob || mongoose.model('OcrJob', OcrJobSchema);

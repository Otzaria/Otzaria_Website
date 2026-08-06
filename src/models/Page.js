import mongoose from 'mongoose';

const PageSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  pageNumber: { type: Number, required: true },
  
  // תוכן הטקסט (נשמר ב-DB במקום בקבצי טקסט)
  content: { type: String, default: '' },
  isTwoColumns: { type: Boolean, default: false },
  rightColumn: { type: String, default: '' },
  leftColumn: { type: String, default: '' },
  rightColumnName: { type: String, default: 'חלק 1' },
  leftColumnName: { type: String, default: 'חלק 2' },
  
  // סטטוס עריכה
  status: { 
    type: String, 
    enum: ['available', 'in-progress', 'completed'], 
    default: 'available',
    index: true 
  },
  
  // נתוני משתמש וזמנים
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  claimedAt: { type: Date },
  completedAt: { type: Date },
  lastAutoReminderAt: { type: Date },
  
  // נתיב התמונה (יחסי, למשל: /uploads/books/mybook/page.1.jpg)
  imagePath: { type: String, required: true } 
}, { timestamps: true });

// אינדקס משולב לשליפה מהירה של עמודים לפי ספר ומספר
PageSchema.index({ book: 1, pageNumber: 1 }, { unique: true });

// אינדקס לסריקות ה-cron של תזכורות/שחרור אוטומטי על עמודים תקועים
PageSchema.index({ status: 1, claimedBy: 1, updatedAt: 1 });

// אינדקס לסטטיסטיקת ההספק — /api/stats/weekly-progress מסנן status+completedAt.
// בלעדיו completedAt לא היה ממופתח בכלל והשאילתה סרקה עמודים לפי סטטוס בלבד.
PageSchema.index({ status: 1, completedAt: 1 });

export default mongoose.models.Page || mongoose.model('Page', PageSchema);
import mongoose from 'mongoose';
import { MAX_ACTIVE_PAGE_CLAIMS } from '../lib/pageClaimPolicy.js';

export const PAGE_CLAIM_QUOTA_INDEX = {
  name: 'page_claim_quota_slot',
  unique: true,
  partialFilterExpression: { status: 'in-progress', quotaUserId: { $type: 'objectId' } },
};

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

  // סדר לוגי של שמירות העורך. הלקוח מקצה revision כשהשינוי נוצר (לא
  // כשהבקשה מסתיימת). כך keepalive/sendBeacon חדש לא נדרס בידי בקשה ישנה
  // שסיימה מאוחר יותר. השדה אינו required כדי לשמור תאימות ללקוחות ישנים.
  contentSaveRevision: { type: Number, min: 1 },

  // Per-occurrence approvals share the text's revision-ordered autosave. The
  // snapshot is aligned conservatively after edits; revision binds it to OCR.
  ocrWordReview: { type: new mongoose.Schema({
    version: { type: Number, required: true },
    revision: { type: String, required: true },
    words: [String],
    accepted: [Number],
  }, { _id: false }), default: null },
  
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
  // מקומות במכסה: האינדקס הייחודי מקצה לכל מתנדב לכל היותר חמישה עמודים,
  // בעדכון אטומי של העמוד עצמו. עובד גם ב-MongoDB standalone, ללא טרנזקציות.
  // אופציונלי: תפיסות ישנות מקבלות מקום לפני שמאשרים למשתמש תפיסה חדשה.
  quotaUserId: { type: mongoose.Schema.Types.ObjectId },
  quotaSlot: { type: Number, min: 0, max: MAX_ACTIVE_PAGE_CLAIMS - 1 },

  // מעקב אחרי החלת OCR מקומי (ספק local): איזו עבודה ואיזו תוצאה כתבו לעמוד לאחרונה.
  // ההחלה מותנית ב-lastOcrJobId — שליחה חוזרת של אותה תוצאה לא כותבת פעמיים.
  lastOcrJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'OcrJob' },
  lastOcrResultSha256: { type: String },
  lastOcrAt: { type: Date },
  // sha256 של הטקסט שנכתב ל-content בכתיבת ה-OCR האחרונה (כל הספקים) — content שונה ממנו = נערך
  // אחרי ה-OCR (pageEditedByHuman, מצב "דלג רק על עמודים שנערכו")
  lastOcrTextSha256: { type: String },
  
  // נתיב התמונה (יחסי, למשל: /uploads/books/mybook/page.1.jpg)
  imagePath: { type: String, required: true } 
}, { timestamps: true });

// אינדקס משולב לשליפה מהירה של עמודים לפי ספר ומספר
PageSchema.index({ book: 1, pageNumber: 1 }, { unique: true });

// אינדקס לסריקות ה-cron של תזכורות/שחרור אוטומטי על עמודים תקועים
PageSchema.index({ status: 1, claimedBy: 1, updatedAt: 1 });
PageSchema.index({ quotaUserId: 1, quotaSlot: 1 }, PAGE_CLAIM_QUOTA_INDEX);

// אינדקס לסטטיסטיקת ההספק — /api/stats/weekly-progress מסנן status+completedAt.
// בלעדיו completedAt לא היה ממופתח בכלל והשאילתה סרקה עמודים לפי סטטוס בלבד.
PageSchema.index({ status: 1, completedAt: 1 });

export default mongoose.models.Page || mongoose.model('Page', PageSchema);

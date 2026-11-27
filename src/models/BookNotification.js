import mongoose from 'mongoose';

// תור השליחה של "ספר חדש בספרייה" למנויי new_books_subscribers (issue #306).
// רשומה אחת לכל ספר — האינדקס הייחודי על book הוא ההגנה מפני שליחה כפולה (לחיצה חוזרת,
// ניסיון חוזר אחרי timeout, הסתרה והצגה מחדש). pending = כתובות שעוד לא טופלו; ה-worker
// (src/lib/book-notifications/worker.js) שולח במנות ומוציא ממנה כל כתובת שטופלה.
const BookNotificationSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, unique: true },
  bookName: { type: String, required: true },
  bookSlug: { type: String },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  status: { type: String, enum: ['queued', 'done', 'failed'], default: 'queued' },
  pending: [{ type: String }],
  total: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  // כתובות שהשרת דחה לצמיתות (תיבה לא קיימת וכו') — לא ננסה אותן שוב
  failedCount: { type: Number, default: 0 },
  // כתובות שהוסרו מרשימת התפוצה אחרי שההודעה נכנסה לתור
  skippedCount: { type: Number, default: 0 },

  nextAttemptAt: { type: Date, default: Date.now },
  // נעילה: worker אחד בלבד שולח מנה בכל רגע (גם כשה-cron והטיימר נפגשים)
  leaseUntil: { type: Date, default: null },
  // כמה פעמים השליחה נעצרה בגלל מגבלת ספק / תקלה זמנית
  deferrals: { type: Number, default: 0 },
  lastError: { type: String },
  completedAt: { type: Date },
}, { timestamps: true });

BookNotificationSchema.index({ status: 1, nextAttemptAt: 1 });

export default mongoose.models.BookNotification || mongoose.model('BookNotification', BookNotificationSchema);

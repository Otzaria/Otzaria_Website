import mongoose from 'mongoose';

// תיעוד של מיילים שכבר נשלחו, לצורך מניעת שליחה חוזרת של תוכן זהה
// לאותו נמען בתוך חלון הזמן המוגדר. אורך החלון נקבע ב-route.js
// (DEDUP_WINDOW_MONTHS) ולא כאן, כדי שלא תיווצר סטייה בין המקומות.
const SentEmailLogSchema = new mongoose.Schema({
  recipient: { type: String, required: true, lowercase: true, trim: true }, // כתובת הנמען (מנורמלת)
  contentHash: { type: String, required: true }, // טביעת אצבע (SHA-256) של כל תוכן הדיווח
  lastSentAt: { type: Date, required: true }, // מתי נשלח לאחרונה תוכן זה לנמען זה
  reportId: { type: String }, // מזהה הדיווח האחרון ששלח תוכן זה (לתיעוד)
  bookTitle: { type: String }, // שם הספר (לתיעוד/דיבוג בלבד)
}, { timestamps: true });

// אינדקס ייחודי לכל צמד נמען+תוכן - מבטיח רשומה אחת לכל צירוף.
// בשילוב עם התפיסה-לפני-שליחה ב-route.js (claimRecipient, שכותב את הרשומה
// *לפני* sendMail) הוא מונע מייל כפול גם במצב מרוץ: הבקשה המקבילה השנייה
// נכשלת כאן ב-E11000 ולכן לא שולחת.
SentEmailLogSchema.index({ recipient: 1, contentHash: 1 }, { unique: true });

export default mongoose.models.SentEmailLog || mongoose.model('SentEmailLog', SentEmailLogSchema);

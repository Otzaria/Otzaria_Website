import mongoose from 'mongoose';
// נתיב יחסי (לא '@/') — כדי שהמודל ייטען גם בבדיקות node:test
import { SCOPES, MAX_NAME, PREFIX_LEN } from '../lib/pageProof/tokenRules.js';

// מפתח-גישה של מנהל OCR לתוכנת-הספר (lib/pageProof/tokenRules.js): מאפשר לה לקרוא, לאשר/לדחות,
// לייבא ולפתוח/לסגור עמודים למתנדבים בהגהת-העמודים בלי דפדפן — ורק שם (lib/pageProof/tokenAuth.js).
// המפתח עצמו מוצג פעם אחת ביצירה ואינו נשמר: רק ה-SHA-256 שלו (hash) ו-8 התווים הראשונים (prefix)
// לזיהוי ברשימה.
// ביטול (revokedAt) חל מיד — כל בקשה קוראת את המפתח מהמסד. המפתח פועל כל עוד המשתמש
// שיצר אותו הוא עדיין מנהל OCR (נבדק בכל שימוש). רשומות שבוטלו או פגו נשמרות לתיעוד.
const PageProofTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    // select:false — לא יוצא בשום שאילתה בלי בקשה מפורשת (החיפוש לפיו עובד כרגיל)
    hash: { type: String, required: true, unique: true, select: false },
    prefix: { type: String, required: true, maxlength: PREFIX_LEN },
    scopes: { type: [{ type: String, enum: SCOPES }], default: () => [...SCOPES] },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PageProofTokenSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.PageProofToken || mongoose.model('PageProofToken', PageProofTokenSchema);

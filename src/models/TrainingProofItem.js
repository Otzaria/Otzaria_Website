import mongoose from 'mongoose';
import { SECTIONS, ITEM_STATUSES } from '../lib/trainingProof/vocab.js';

// פריט בהגהה לאימון (docs/76 §4, §8.1): שורה (ocr/router) או עמוד (frames).
// payload = השורה מ-items.jsonl כפי שהגיעה (כולל uid/sig/book/alias) — מקור-האמת
// לתצוגה ולקובץ-ההחזרה. imagePath = נתיב התמונה בתיקיית ההעלאות.
//
// מחזור-החיים:
//   available ← held (בסבב של מתנדב; heldUntil = הדופק האחרון + 3 דקות)
//   held ← submitted (סימון; נשמר מיד) | available (דלג / הדופק פסק)
//   submitted ← approved (המנהל) | available (נדחה: result נמחק, המתנדב נכנס ל-notFor)
//   approved ← נמחק אחרי שההורדה לתחנה הסתיימה (§8.2)
const TrainingProofItemSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    section: { type: String, enum: SECTIONS, required: true },
    packageId: { type: String, required: true },
    part: { type: Number, default: 1 },
    sig: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    imagePath: { type: String, required: true },
    // תמונת-ההקשר (העמוד המלא) — משותפת לכמה שורות; ריק כשאין
    ctxPath: { type: String, default: null },
    book: { type: String, default: null }, // המפתח האטום b-… (לא שם)
    // לסינון בניהול: track (ocr), pred (router), ptype (frames)
    track: { type: String, default: null },

    status: { type: String, enum: ITEM_STATUSES, default: 'available' },
    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    heldUntil: { type: Date, default: null },
    // מזהה הסבב שבו הפריט נלקח — כדי להציג את הסבב הנוכחי גם אחרי רענון הדף
    round: { type: String, default: null },
    heldAt: { type: Date, default: null },
    // מתנדבים שלא יקבלו את הפריט שוב (דילגו עליו, או שהגשתם נדחתה)
    notFor: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // מתנדבים שהגשתם לפריט נדחתה (גם ב-notFor) — ל"נדחו" ב"ההגהות שלי" ובניהול
    rejectedFor: { type: [mongoose.Schema.Types.ObjectId], default: [] },

    result: { type: mongoose.Schema.Types.Mixed, default: null },
    // נעילה קצרת-חיים בזמן שינוי סוג זרם בספר. מונעת משמירה/אישור מקבילים
    // לדרוס את הסנכרון הרב-מסמכי (MongoDB בייצור הוא standalone, ללא transactions).
    streamChange: { type: mongoose.Schema.Types.Mixed, default: null },
    vol: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // המנהל תיקן לפני האישור ("תקן ואשר", ה-11)
    adminFixed: { type: Boolean, default: false },
    // התוצאה המקורית של המתנדב כשהמנהל תיקן — ל"שיעור ההתאמה"
    volResult: { type: mongoose.Schema.Types.Mixed, default: null },
    // outbox: null עד שרשומת TrainingProofCorrection נשמרה. מאפשר להשלים כשל
    // בלי להחזיר רשומות ישנות שנגזמו בכוונה ממגבלת היומן.
    correctionLoggedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

TrainingProofItemSchema.index({ uid: 1, packageId: 1 }, { unique: true });
// הסבב: דגימה של הפנויים בחלק
TrainingProofItemSchema.index({ section: 1, status: 1, heldUntil: 1 });
// הסבב הנוכחי של מתנדב, והדופק
TrainingProofItemSchema.index({ heldBy: 1, section: 1, status: 1 });
// "ההגהות שלי" והסקירה בניהול
TrainingProofItemSchema.index({ vol: 1, section: 1, status: 1 });
TrainingProofItemSchema.index({ packageId: 1, part: 1 });
// ספירת עמודי ספר בגלאי בלי לסרוק את כל עמודי החלק
TrainingProofItemSchema.index({ section: 1, book: 1 });

export default mongoose.models.TrainingProofItem || mongoose.model('TrainingProofItem', TrainingProofItemSchema);

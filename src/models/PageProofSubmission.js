import mongoose from 'mongoose';

// הגשה של מתנדב לעמוד אחד: רשימת פעולות בסוגי חוזה-העמוד §3 (אחרי דחיסה).
// submitted → approved (נכנסת לתיקונים.json) או rejected (העמוד חוזר למאגר).
// מנהל רשאי לתקן את הפעולות לפני האישור (reviewerEdited).
const PageProofSubmissionSchema = new mongoose.Schema(
  {
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'PageProofPage', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'PageProofBook', required: true },
    gid: { type: String, required: true },
    pageNo: { type: Number, required: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String },
    // המזהה שיוצא בשדה who — יציב לכל מתייג, לא שם (ראו lib/pageProof/fixesExport)
    who: { type: String, required: true },

    ops: { type: [mongoose.Schema.Types.Mixed], default: [] },
    opCount: { type: Number, default: 0 },
    // הפעולות משנות את חיתוך-השורות (ops.needsRecut) — אחרי אישור העמוד עובר
    // למצב 'recut' וחוזר לתוכנת-הספר לחיתוך ולזיהוי-מחדש
    needsRecut: { type: Boolean, default: false },
    // גרסת-העמוד שעליה נעשתה ההגשה (PageProofPage.revision בעת ההגשה). הגשה
    // על גרסה קודמת אינה משנה את המונים/המצב של העמוד שהוחלף
    revision: { type: Number, default: 1 },
    // הערה חופשית של המתייג למנהל (לא נשלחת בתיקונים)
    note: { type: String, default: '' },

    status: { type: String, enum: ['submitted', 'approved', 'rejected'], default: 'submitted', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: '' },
    reviewerEdited: { type: Boolean, default: false },

    // מתי יצאה בקובץ-תיקונים ("הורד חדשים" מסמן)
    exportedAt: { type: Date, default: null },

    // בקשת מתנדב לזיהוי-מחדש (lib/pageProof/recutRequests.js): רק פעולות-חיתוך, ונשמרת
    // מאושרת לצורך הזיהוי-מחדש בלבד (status 'approved', reviewedByName "בקשת מתנדב
    // לזיהוי-מחדש") — כך קובץ-התיקונים (?pages=recut) והייבוא מטפלים בה כמו בכל תיקון-חיתוך
    // מאושר. אינה הגשה של העמוד: לא נספרת במונים שלו, ב"העמודים שלי" ובסטטיסטיקה של המתנדב.
    // ביטול — "שחרור מהמתנה" של מנהל (status 'rejected'); recutDoneAt — מתי חזר העמוד בגרסה
    // החדשה (עד אז — ממתינה, ונספרת בתקרת הבקשות של המתנדב).
    recutRequest: { type: Boolean, default: false },
    recutDoneAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PageProofSubmissionSchema.index({ status: 1, createdAt: 1 });
PageProofSubmissionSchema.index({ gid: 1, status: 1, pageNo: 1 });
PageProofSubmissionSchema.index({ page: 1, user: 1 });
PageProofSubmissionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.PageProofSubmission ||
  mongoose.model('PageProofSubmission', PageProofSubmissionSchema);

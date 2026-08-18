import mongoose from 'mongoose';

/**
 * מקור של ספר פרטי (תיקיית MoreBooks בריפו Otzaria/otzaria-library).
 *
 * רשומה אחת לכל ספר (= קובץ בודד בריפו), ובה מי מסר את הספר, מי השיג את
 * האישור, באיזה אופן ניתן, ובאילו תנאים מותר לפרסם אותו.
 *
 * רשימת הספרים עצמה נמשכת מגיטהאב בזמן אמת — כאן נשמרים רק המטא־נתונים,
 * ולכן ייתכנו ספרים ללא רשומה כלל (ואלו בדיוק אלו שדורשים טיפול).
 */
const CustomFieldSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    value: { type: String, default: '' },
  },
  { _id: false }
);

const PrivateBookSourceSchema = new mongoose.Schema(
  {
    // מזהה הספר: הנתיב היחסי לתיקיית MoreBooks,
    // למשל "ספרים/אוצריא/הלכה/אחרונים/כתר ראש.txt"
    bookPath: { type: String, required: true, unique: true, index: true, trim: true },
    // שם לתצוגה (שם הקובץ ללא סיומת) — משוכפל לצורכי חיפוש ותצוגה
    bookTitle: { type: String, default: '' },

    // בעל הזכויות / מוסר הספר
    ownerName: { type: String, default: '' },
    ownerEmail: { type: String, default: '' },
    ownerPhone: { type: String, default: '' },

    // מי השיג את האישור מטעמנו
    obtainedBy: { type: String, default: '' },
    obtainedByEmail: { type: String, default: '' },
    obtainedByPhone: { type: String, default: '' },
    // משיג האישור הוא גם בעל הזכויות (ואז פרטי הקשר שלו הם של הבעלים)
    obtainerSameAsOwner: { type: Boolean, default: false },

    // אופן קבלת האישור — מפתח מתוך רשימה דינמית (SystemConfig)
    permissionMethod: { type: String, default: '' },
    // פירוט: איזה מייל / איזה צ'אט / איזה מספר טלפון וכו'
    permissionMethodDetail: { type: String, default: '' },
    permissionDate: { type: Date, default: null },

    // חובת מתן קרדיט בפרסום
    requireCredit: { type: Boolean, default: false },

    // פלטפורמות שאושרו — מפתחות מתוך רשימה דינמית (SystemConfig)
    allowedPlatforms: { type: [String], default: [] },

    // תנאים נוספים והערות חופשיות
    conditionsText: { type: String, default: '' },
    notes: { type: String, default: '' },

    // סטטוס — מפתח מתוך רשימה דינמית (SystemConfig)
    status: { type: String, default: 'missing_info', index: true },

    // שדות נוספים שהמנהל מוסיף בעצמו לרשומה
    customFields: { type: [CustomFieldSchema], default: [] },

    // מי עדכן לאחרונה (מייל/שם מהסשן)
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

PrivateBookSourceSchema.index({ ownerName: 1 });

export default mongoose.models.PrivateBookSource ||
  mongoose.model('PrivateBookSource', PrivateBookSourceSchema);

import mongoose from 'mongoose';

/**
 * ספר במרחב עריכת הספרים הערוכים (Dicta "ערוך").
 *
 * מודל האמת הוא ה-DB:
 *  - content     = "שלנו" (הגרסה החיה באתר, מקור האמת)
 *  - baseContent = האב המשותף — מה שנמשך לאחרונה מגיטהאב (בסיס למיזוג 3-way)
 *  - baseSha     = blob sha של baseContent בריפו המשיכה
 *
 * נפרד לחלוטין מ-DictaBook (זרימת ה-claim על "לא ערוך").
 */
const LibraryBookSchema = new mongoose.Schema({
  // נתיב יחסי לתיקיית הבסיס בגיטהאב — מזהה ייחודי, למשל "הלכה/אחרונים/דרך החיים.txt"
  path: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },     // path בלי סיומת .txt
  category: { type: String, default: '' },      // הסגמנט הראשון בנתיב

  content: { type: String, default: '' },       // הגרסה החיה (מקור האמת)
  baseContent: { type: String, default: '' },   // אב משותף לסנכרון
  baseSha: { type: String, default: null },     // blob sha של baseContent (ריפו משיכה)
  pushSha: { type: String, default: null },     // sha אחרון שנדחף (ריפו דחיפה)

  // מונה אופטימי לקונקרנציה — עולה בכל שינוי תוכן שמוחל
  version: { type: Number, default: 1 },

  // מצב מול גיטהאב:
  //  clean    = התוכן זהה למה שנדחף לאחרונה
  //  dirty    = יש שינויים מאושרים שטרם נדחפו
  //  conflict = מיזוג נכשל וממתין לפתרון מנהל
  syncStatus: {
    type: String,
    enum: ['clean', 'dirty', 'conflict'],
    default: 'clean',
    index: true,
  },

  pendingCount: { type: Number, default: 0 },   // הצעות ממתינות (לתצוגה מהירה)

  lastSyncedAt: { type: Date, default: null },  // משיכה אחרונה מגיטהאב
  lastPushedAt: { type: Date, default: null },  // דחיפה אחרונה לגיטהאב

  // ספר שהוסר מגיטהאב — לא נמחק אוטומטית, רק מסומן
  removedUpstream: { type: Boolean, default: false },

  // פרטי קונפליקט סנכרון (כאשר syncStatus='conflict') — לפתרון ידני ע"י מנהל
  conflict: {
    theirsContent: { type: String, default: null }, // התוכן בגיטהאב בזמן הקונפליקט
    theirsSha: { type: String, default: null },
    detectedAt: { type: Date, default: null },
    conflictCount: { type: Number, default: 0 },
  },
}, { timestamps: true });

LibraryBookSchema.index({ category: 1, title: 1 });
LibraryBookSchema.index({ syncStatus: 1, updatedAt: 1 });

export default mongoose.models.LibraryBook || mongoose.model('LibraryBook', LibraryBookSchema);

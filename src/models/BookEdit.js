import mongoose from 'mongoose';
import { EDIT_TYPE_IDS } from '@/lib/dicta/edit-constants';

/**
 * יחידת שינוי במרחב העריכה — גם הצעה ממתינה וגם שינוי שהוחל.
 *
 * שמירת changes כ-לפני→אחרי ברמת שורה מאפשרת:
 *  - גלגול אחורי (revert) של שינוי / של כל מה שמשתמש מסוים עשה
 *  - אישור באצווה לפי תבנית (כל ההחלפות find→replace זהות)
 *  - הצגת diff בתור האישורים
 */
const ChangeSchema = new mongoose.Schema({
  line: { type: Number, required: true },  // אינדקס שורה (0-based) בגרסת הבסיס של ההצעה
  before: { type: String, default: '' },
  after: { type: String, default: '' },
}, { _id: false });

const BookEditSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryBook', required: true, index: true },
  bookPath: { type: String, required: true },   // denormalized לסינון/תצוגה

  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  authorName: { type: String, default: '' },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  // האם הוחל ישירות (עריכת מפקח/מנהל — נוצר כבר כ-approved)
  appliedDirectly: { type: Boolean, default: false },

  kind: { type: String, enum: ['manual', 'find-replace'], default: 'manual' },

  // סיווג אופציונלי (יכול להיות null)
  editType: { type: String, enum: [...EDIT_TYPE_IDS, null], default: null },
  note: { type: String, default: '' },

  // למקרה של חיפוש-והחלפה — לאישור באצווה לפי תבנית
  findReplace: {
    find: { type: String, default: null },
    replace: { type: String, default: null },
    isRegex: { type: Boolean, default: false },
    flags: { type: String, default: '' },
    caseSensitive: { type: Boolean, default: false },
  },

  changes: { type: [ChangeSchema], default: [] },

  // הגרסה (version של הספר) שעליה התבססה ההצעה — לרבייס/זיהוי קונפליקט
  baseVersion: { type: Number, default: null },

  // אישור / דחייה
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewerName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },

  // מזהה אצווה — כשמאשרים/דוחים כמה ביחד
  batchId: { type: String, default: null, index: true },

  // הוחל בפועל על תוכן הספר? (מאושר אך ייתכן שלא הוחל אם נוצר קונפליקט בעת היישום)
  applied: { type: Boolean, default: false },
}, { timestamps: true });

BookEditSchema.index({ status: 1, book: 1, createdAt: -1 });
BookEditSchema.index({ author: 1, status: 1 });
// לאישור באצווה לפי תבנית
BookEditSchema.index({ 'findReplace.find': 1, 'findReplace.replace': 1, status: 1 });

export default mongoose.models.BookEdit || mongoose.model('BookEdit', BookEditSchema);

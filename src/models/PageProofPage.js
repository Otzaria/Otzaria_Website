import mongoose from 'mongoose';

// עמוד בהגהת-עמודים: עמוד-NNN.json כפי שהגיע (doc) + תמונת-העמוד בדיסק.
// המתנדב מקבל רצף (seq) של עד 5 עמודים עוקבים מאותו ספר, ומגיש כל עמוד
// בנפרד (PageProofSubmission). עמוד "כפול" (required=2) דורש הגשות משני
// אנשים שונים. שום הגשה אינה נכנסת לקובץ-התיקונים בלי אישור מנהל.
const PageProofPageSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'PageProofBook', required: true },
    gid: { type: String, required: true },
    // מספר-העמוד כמו בחבילה (החוזה: page) — אליו מתייחסות הפעולות
    page: { type: Number, required: true },
    seq: { type: Number, required: true },

    // עמוד-NNN.json כמות-שהוא (שדה שהאתר אינו מכיר נשמר ונשלח הלאה —
    // "הצרכן חייב להתעלם משדה שאינו מכיר")
    doc: { type: mongoose.Schema.Types.Mixed, required: true },
    lineCount: { type: Number, default: 0 },

    // /uploads/page-proof/<gid>/pNNN.jpg — חסום כנכס סטטי, מוגש רק דרך
    // /api/page-proof/pages/[id]/image. הממדים = doc.size (הקואורדינטות בעמוד).
    // במצב-קישור: תמונת-העמוד של הספר באתר (/uploads/books/...)
    imagePath: { type: String, required: true },
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 },
    // מצב-קישור: עמוד-הספר באתר שתמונתו מוצגת (imagePath מצביע אליה). אז
    // imageWidth/Height הם של תמונת-האתר, ו-doc.size של תוכנת-הספר — אותו יחס.
    sitePage: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', default: null },

    required: { type: Number, default: 1, min: 1, max: 2 },
    // הגשות פעילות (ממתינות + מאושרות); דחייה מורידה את המונה ומחזירה מקום
    activeCount: { type: Number, default: 0 },
    approvedCount: { type: Number, default: 0 },
    // מי כבר הגיש (הגשה פעילה) — אותו אדם לא יקבל את העמוד שוב (חשוב בכפולים)
    submitters: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // open = חסרות הגשות; done = activeCount >= required;
    // recut = הגשה מאושרת שינתה את חיתוך-השורות (פיצול/איחוד/הוספה/תיבה) —
    // העמוד ממתין לחיתוך ולזיהוי-מחדש בתוכנת-הספר ואינו מוצע למתנדבים, עד
    // שהגרסה החדשה שלו (revision+1) מיובאת ומחליפה אותו (lib/pageProof/importRules)
    status: { type: String, enum: ['open', 'done', 'recut'], default: 'open', index: true },
    // גרסת-העמוד (חוזה-העמוד: revision ברמת-העמוד). עמוד שחזר מזיהוי-מחדש
    // מגיע עם גרסה גבוהה יותר ונפתח למעבר שני
    revision: { type: Number, default: 1, min: 1 },

    // החכרה: הרצף שמור למתנדב שקיבל אותו עד leasedUntil (מתחדש בכל פתיחה)
    leasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    leasedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

PageProofPageSchema.index({ gid: 1, page: 1 }, { unique: true });
PageProofPageSchema.index({ book: 1, seq: 1, page: 1 });
PageProofPageSchema.index({ status: 1, leasedUntil: 1 });
PageProofPageSchema.index({ leasedBy: 1, leasedUntil: 1 });

export default mongoose.models.PageProofPage || mongoose.model('PageProofPage', PageProofPageSchema);

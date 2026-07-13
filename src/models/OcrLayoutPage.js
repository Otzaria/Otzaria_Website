import mongoose from 'mongoose';

// עמוד לתיוג מבנה-עמוד (OCR Layout Labeling) — מישור-מתנדבים שלישי, לצד
// OcrLine (תמלול שורות) ו-OcrTrainingPage (סימון שורות). ראה
// docs/OCR_LAYOUT_LABELING_PLAN.md. העמודים מיובאים מאצוות ZIP שמפיק
// scripts/export_labeling_batch.py בפרויקט OCR-AI: המכונה כבר עשתה את
// העבודה (prefill מלא), המתנדב רק מכריע במיקרו-שאלות ממוקדות.

// מיקרו-שאלה אחת של העמוד. prefill/answer הם Mixed כי הצורה תלויה ב-kind
// (ראה src/lib/ocr/layoutValidation.js — מקור אמת יחיד לצורות ולוולידציה):
//   pagenum: prefill {box|null, expected, hebrew}          answer {value|null}
//   header:  prefill {box|null, y_band, texts}             answer {box|null}
//   streams: prefill {bands:[{y0,y1,book_stream}], legend} answer {bands:[...]}
//   zones-full: prefill {pagenum|null, header|null, streams|null} — שילוב
//               השלושה במסך אחד; answer באותו מבנה מקונן.
const OcrLayoutTaskSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['pagenum', 'header', 'streams', 'zones-full'],
      required: true,
    },
    prefill: { type: mongoose.Schema.Types.Mixed, default: null },
    // הכרעת המתנדב — null עד שנענתה. בשמירה השרת ממלא את answer גם כאשר
    // confirmed=true (מוחשב מה-prefill), כך שהייצוא קורא תמיד מ-answer.
    answer: { type: mongoose.Schema.Types.Mixed, default: null },
    // true = "המכונה צדקה" בלחיצה אחת (נשמר לסטטיסטיקה, בנוסף ל-answer)
    confirmed: { type: Boolean, default: false },
  },
  { _id: false }
);

const OcrLayoutPageSchema = new mongoose.Schema(
  {
    // מזהה אצוות-ייבוא (למשל "hard7-2026-07") — לסינון בניהול ולייבוא-חוזר
    batch: { type: String, required: true },
    // מזהה המהדורה בפרויקט ה-OCR (ed057) — מהדורות הקורפוס אינן "ספרים" באתר
    edition: { type: String, required: true },
    // שם העמוד בפרויקט ה-OCR (p0012)
    pageStem: { type: String, required: true },

    // נתיב התמונה שמעליה מצוירות שכבות ה-prefill. שני מצבים:
    //  • אצווה עם תמונות: תמונת העמוד המיושרת (deskew) שצורפה ל-ZIP,
    //    ‏/uploads/ocr-layout/<batch>/… (חסומה כנכס סטטי).
    //  • מצב-קישור (book מוגדר): מצביע לתמונת-הספר הקיימת באתר
    //    ‏(/uploads/books/<slug>/page.N.jpg) — ה-prefill במרחב הסריקה
    //    המקורית, ולכן מתלבש עליה בלי צורך בהעלאה כפולה.
    // בשני המקרים התיבות ב-prefill הן בפיקסלים של התמונה הזו. מוגשת רק
    // דרך /api/ocr-layout/[id]/image.
    imagePath: { type: String, required: true },
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 },

    // מצב-קישור: הפניה לעמוד-הספר הקיים במקום העלאת תמונה נפרדת. ריק
    // באצוות עם תמונות מצורפות.
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
    bookSlug: { type: String },
    pageNumber: { type: Number },

    // המיקרו-שאלות של העמוד — עמוד אחד = מסך אחד, כל השאלות יחד
    tasks: { type: [OcrLayoutTaskSchema], default: [] },

    // כמו OcrLine: כל הגשה ממתינה לאישור מנהל — שום דבר לא מאושר אוטומטית
    status: {
      type: String,
      enum: ['available', 'submitted', 'approved'],
      default: 'available',
      index: true,
    },

    // "החכרה רכה": עד מתי העמוד שמור למשתמש שקיבל אותו (ראו OcrLine)
    leasedUntil: { type: Date },

    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    answeredByName: { type: String },
    answeredAt: { type: Date },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

// הגשת משימות: דגימת עמודים זמינים שאינם מוחכרים
OcrLayoutPageSchema.index({ status: 1, leasedUntil: 1 });
// ייבוא חוזר של אותה אצווה = upsert, לא כפילויות
OcrLayoutPageSchema.index({ batch: 1, edition: 1, pageStem: 1 }, { unique: true });

export default mongoose.models.OcrLayoutPage ||
  mongoose.model('OcrLayoutPage', OcrLayoutPageSchema);

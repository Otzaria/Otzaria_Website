import mongoose from 'mongoose';

// עמוד ייעודי לאיסוף נתוני אימון ל-OCR (פרויקט Hebrew OCR Engine).
// נפרד לחלוטין מ-Page הרגיל: אדמין בוחר ספר+עמוד (גם ספרים מוסתרים),
// והמשתמשים מסמנים שורות בודדות (תיבה מלבנית בפיקסלים) וכותבים את הטקסט שלהן.
// כל שורה מיוצאת בהמשך כחיתוך תמונה + תמלול בפורמט manifest של הפרויקט.

const LineSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true }, // סדר השורה בעמוד (0-based)
    // תיבת התוחם בפיקסלים של התמונה המקורית (natural pixels)
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    text: { type: String, default: '' },
  },
  { _id: false }
);

const OcrTrainingPageSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    bookName: { type: String, required: true }, // denormalized לתצוגה
    bookSlug: { type: String, required: true }, // denormalized לשמות קבצים בייצוא
    pageNumber: { type: Number, required: true },

    // נתיב התמונה כפי שנשמר ב-Page (יחסי, למשל /uploads/books/<slug>/page.1.jpg)
    imagePath: { type: String, required: true },
    // מידות התמונה המקורית בפיקסלים — נמדדות בעת ההוספה (sharp)
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 },

    // סוג הכתב — קובע לאיזה צינור אימון (square/rashi) העמוד שייך בייצוא
    scriptType: { type: String, enum: ['square', 'rashi'], default: 'square' },

    // סיבוב תצוגה של העמוד במעלות (יישור). התיבות נשמרות במרחב התמונה *לאחר* הסיבוב,
    // והייצוא מסובב את המקור באותה זווית לפני החיתוך — כך שהחיתוך תואם למה שהמשתמש ראה.
    rotation: { type: Number, default: 0 },

    // יעד שורות לעמוד — קבוע 10 לפי דרישת הפרויקט (בדיוק 10 שורות לעמוד)
    targetLines: { type: Number, default: 10 },

    status: {
      type: String,
      enum: ['available', 'in-progress', 'completed'],
      default: 'available',
      index: true,
    },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    claimedByName: { type: String },
    claimedAt: { type: Date },
    completedAt: { type: Date },

    lines: { type: [LineSchema], default: [] },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// עמוד אחד בלבד לכל ספר+מספר-עמוד במאגר האימון
OcrTrainingPageSchema.index({ book: 1, pageNumber: 1 }, { unique: true });

export default mongoose.models.OcrTrainingPage ||
  mongoose.model('OcrTrainingPage', OcrTrainingPageSchema);

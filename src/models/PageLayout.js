import mongoose from 'mongoose';
import { PAGE_LAYOUT_LIMITS, PAGE_LAYOUT_SOURCES } from '../lib/editor/pageLayoutValidation.js';

// תיבות שורות/מילים שמורות לעמוד שאין לו פריסת OCR (תוכנית העורך §5.1, מקורות 3–5): זיהוי
// מקומי בדפדפן (tesseract.js), פרופיל הקרנה או סרגל ידני. נשמר אחרי הזיהוי הראשון כדי שהמתנדב
// הבא לא יחכה. מודל נפרד מ-Page בכוונה — לא נוגע בחוזה של /api/page-content (נצרך גם מחוץ לאתר).
//
// הקואורדינטות בפיקסלים טבעיים של התמונה כפי שהדפדפן מציג אותה (אחרי EXIF). imageSha256 —
// התמונה שעליה חושבו התיבות; GET /api/page-layout מסמן stale כשהקובץ הוחלף.
// הוולידציה המלאה (גבולות, תקרות) ב-src/lib/editor/pageLayoutValidation.js — כאן רק רשת ביטחון.
// עדכונים רק מותנים (findOneAndUpdate עם version), לא doc.save().

const box = {
  type: [Number],
  validate: { validator: (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite), message: 'bbox לא תקין' },
};

const WordSchema = new mongoose.Schema(
  {
    bbox: { ...box, required: true },
    text: { type: String, maxlength: PAGE_LAYOUT_LIMITS.maxTextLength },
    conf: { type: Number, min: 0, max: 1 },
  },
  { _id: false }
);

const LineSchema = new mongoose.Schema(
  {
    bbox: { ...box, required: true },
    stream: { type: String, default: 'main', maxlength: 32 },
    words: {
      type: [WordSchema],
      default: [],
      validate: { validator: (a) => a.length <= PAGE_LAYOUT_LIMITS.maxWordsPerLine, message: 'יותר מדי מילים בשורה' },
    },
  },
  { _id: false }
);

const PageLayoutSchema = new mongoose.Schema(
  {
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    // זיהוי החלפת תמונה: הנתיב בזמן השמירה, וה-sha256 של הקובץ (null אם לא נקרא)
    imagePath: { type: String, required: true },
    imageSha256: { type: String, default: null },
    source: { type: String, enum: PAGE_LAYOUT_SOURCES, required: true },
    size: {
      type: [Number],
      required: true,
      validate: { validator: (s) => s.length === 2 && s.every((n) => Number.isInteger(n) && n > 0), message: 'size לא תקין' },
    },
    lines: {
      type: [LineSchema],
      default: [],
      validate: { validator: (a) => a.length <= PAGE_LAYOUT_LIMITS.maxLines, message: 'יותר מדי שורות' },
    },
    wordCount: { type: Number, default: 0, max: PAGE_LAYOUT_LIMITS.maxWords },
    // מונה שמירות — בדיקת התנגשות (expectedVersion) ב-PUT
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// רשומה אחת לעמוד
PageLayoutSchema.index({ page: 1 }, { unique: true });
// ניקוי/סטטיסטיקה לפי ספר
PageLayoutSchema.index({ book: 1, updatedAt: -1 });

export default mongoose.models.PageLayout || mongoose.model('PageLayout', PageLayoutSchema);

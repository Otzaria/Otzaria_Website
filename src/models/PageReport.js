import mongoose from 'mongoose';
// נתיב יחסי (לא '@/') — כדי שהמודל ייטען גם בבדיקות node:test
import { REPORT_KINDS, ALL_STATUSES, COLUMNS } from '../lib/pageReports/rules.js';
import { CROP_SOURCES, CROP_LEVELS } from '../lib/pageReports/cropRect.js';

// דיווח על עמוד בספר מצולם: טעות בספר עצמו (סימון "(מקור)[תיקון]" בטקסט) או הודעה חופשית למנהלים.
// ראו src/lib/pageReports/rules.js לכללים המלאים.
const resolutionSchema = new mongoose.Schema(
  {
    note: { type: String, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String, default: '' },
    at: Date,
  },
  { _id: false }
);

const fracRect = { x: Number, y: Number, w: Number, h: Number };
const cropRectSchema = new mongoose.Schema(
  {
    ...fracRect,
    source: { type: String, enum: CROP_SOURCES },
    level: { type: String, enum: CROP_LEVELS },
    mark: { type: new mongoose.Schema(fracRect, { _id: false }), default: null },
  },
  { _id: false }
);

const PageReportSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: REPORT_KINDS, required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    bookPath: { type: String, required: true },
    bookName: { type: String, default: '' },
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true },
    pageNumber: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },

    // book_error בלבד
    column: { type: String, enum: COLUMNS, default: 'content' },
    original: { type: String, default: '' },
    proposed: { type: String, default: '' },
    offset: { type: Number, default: null },
    contextBefore: { type: String, default: '' },
    contextAfter: { type: String, default: '' },
    // האזור בצילום שבו נמצא הטקסט המדווח (שברים 0..1 מגודל התמונה) — רק כשהמעקב בעורך מיקם אותו
    // באמינות; אחרת null. ראו src/lib/pageReports/cropRect.js
    cropRect: { type: cropRectSchema, default: null },

    // הערת המדווח (book_error) / תוכן ההודעה (message)
    message: { type: String, default: '' },

    status: { type: String, enum: ALL_STATUSES, default: 'pending' },
    resolution: { type: resolutionSchema, default: null },
    // החלה על טקסט העמוד: null = לא הוחל; 'proposed' / 'original' = מה נכתב במקום הסימון
    appliedToText: { type: String, enum: [null, 'proposed', 'original'], default: null },
    appliedAt: { type: Date, default: null },
    // הנוסח שהמנהל קבע בהכרעה, כשהוא שונה משל המדווח (null = כמו המדווח); original / proposed נשארים כמו שדווחו
    finalOriginal: { type: String, default: null },
    finalProposed: { type: String, default: null },
    finalBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalByName: { type: String, default: '' },
    finalAt: { type: Date, default: null },
    // הסימון שבטקסט העמוד אחרי שעודכן לנוסח המנהל (null = הסימון של המדווח) — כדי למצוא אותו אחר כך
    markerOriginal: { type: String, default: null },
    markerProposed: { type: String, default: null },
  },
  { timestamps: true }
);

// רשימת הניהול (kind+status, מיון createdAt/_id) ומוני הסרגל/הדשבורד (kind+status)
PageReportSchema.index({ kind: 1, status: 1, createdAt: -1, _id: -1 });
// סינון הניהול לפי ספר (וספירות הלשוניות באותו סינון)
PageReportSchema.index({ book: 1, kind: 1, status: 1 });
PageReportSchema.index({ page: 1, createdAt: -1 });
PageReportSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.PageReport || mongoose.model('PageReport', PageReportSchema);

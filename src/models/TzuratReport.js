import mongoose from 'mongoose';
// נתיב יחסי (לא '@/') — כדי שהמודל ייטען גם בבדיקות node:test
import { REPORT_CATEGORIES, REPORT_STATUSES } from '../lib/tzuratHadaf/reportRules.js';

// צורת הדף — דיווח חופשי על עמוד (גם מחוץ להגשה). regions — אזורים בשברים 0–1 מהתמונה (scan/ours).
// fixed (בסנכרון או בידי מנהל) ← +2 נקודות למדווח, פעם אחת (pointsAwarded).
const regionSchema = new mongoose.Schema(
  { side: { type: String, enum: ['scan', 'ours'] }, x: Number, y: Number, w: Number, h: Number },
  { _id: false }
);

const TzuratReportSchema = new mongoose.Schema(
  {
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'TzuratPage', required: true },
    slug: { type: String, required: true },
    dafKey: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    who: { type: String, default: '' },
    userName: { type: String, default: '' },
    category: { type: String, enum: REPORT_CATEGORIES, default: 'other' },
    text: { type: String, default: '' },
    regions: { type: [regionSchema], default: [] },
    status: { type: String, enum: REPORT_STATUSES, default: 'new' },
    resolution: {
      type: new mongoose.Schema(
        { note: String, buildId: String, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } },
        { _id: false }
      ),
      default: null,
    },
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'TzuratSubmission', default: null },
    pointsAwarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TzuratReportSchema.index({ status: 1, createdAt: -1 });
TzuratReportSchema.index({ user: 1, createdAt: -1 });
TzuratReportSchema.index({ page: 1 });
TzuratReportSchema.index({ updatedAt: 1, _id: 1 });

export default mongoose.models.TzuratReport || mongoose.model('TzuratReport', TzuratReportSchema);

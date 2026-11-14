import mongoose from 'mongoose';

// ייצוא דו-שלבי: GET בונה רשימת הגשות בלי לנעול אותן; ACK לאחר קבלת הקובץ מסמן exportedAt.
const TzuratExportJobSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['building', 'ready', 'acked'], default: 'building' },
    submissions: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    readyAt: { type: Date, default: null },
    ackedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

TzuratExportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.TzuratExportJob || mongoose.model('TzuratExportJob', TzuratExportJobSchema);

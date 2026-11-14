import mongoose from 'mongoose';

// צורת הדף — חבילה מיובאת אחת (מסכת × בנייה). ייבוא חוזר של אותה מסכת מעדכן את המסמך (ייחודי לפי slug).
// paused — המסכת אינה מוצעת במסלול המהיר ולא לתפיסת עמודים חדשים. docs/tzurat-hadaf/CONTRACT.md "מודלים".
const TzuratBatchSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    masechet: { type: String, default: '' },
    buildId: { type: String, default: '' },
    order: { type: Number, default: 0 },
    importedAt: { type: Date, default: null },
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pages: { type: Number, default: 0 },
    items: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
  },
  { timestamps: true }
);

TzuratBatchSchema.index({ slug: 1 }, { unique: true });
TzuratBatchSchema.index({ order: 1 });

export default mongoose.models.TzuratBatch || mongoose.model('TzuratBatch', TzuratBatchSchema);

import mongoose from 'mongoose';

// צורת הדף — טיוטה אחת לעמוד (page ייחודי) של מי שמחזיק בו. שמירה עם בדיקת updatedAt (מקביליות אופטימית);
// ההגשה מוחקת אותה.
const TzuratDraftSchema = new mongoose.Schema(
  {
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'TzuratPage', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: String, default: '' },
    stage: { type: String, enum: ['overview', 'lines', 'text', 'submit'], default: 'overview' },
    state: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

TzuratDraftSchema.index({ page: 1 }, { unique: true });

export default mongoose.models.TzuratDraft || mongoose.model('TzuratDraft', TzuratDraftSchema);

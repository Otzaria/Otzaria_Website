import mongoose from 'mongoose';

// יומן פעולות של מערכת התיקונים (append-only). בלי סודות, בלי פרטי קשר ובלי תוכן מלא.
const CorrectionEventSchema = new mongoose.Schema({
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'ErrorReport', required: true },
  type: { type: String, required: true },
  actorKind: { type: String, enum: ['user', 'worker', 'service', 'system', 'public'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: { type: String, default: null },
  generation: { type: Number, default: null },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

CorrectionEventSchema.index({ report: 1, createdAt: 1 });

export default mongoose.models.CorrectionEvent || mongoose.model('CorrectionEvent', CorrectionEventSchema);

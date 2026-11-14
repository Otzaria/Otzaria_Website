import mongoose from 'mongoose';
import { SECTIONS } from '../lib/trainingProof/vocab.js';

const TrainingProofExportLockSchema = new mongoose.Schema(
  {
    section: { type: String, enum: SECTIONS, required: true, unique: true },
    exportId: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: false }
);

export default mongoose.models.TrainingProofExportLock ||
  mongoose.model('TrainingProofExportLock', TrainingProofExportLockSchema);

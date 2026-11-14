import mongoose from 'mongoose';
import { SECTIONS } from '../lib/trainingProof/vocab.js';

// הוראות-ההגהה לכל חלק (docs/76 §8.1). בעל הפרויקט עורך אותן במסך הניהול;
// המתנדב רואה אותן בכפתור "הוראות" בכל מסך.
const TrainingProofGuideSchema = new mongoose.Schema(
  {
    section: { type: String, enum: SECTIONS, required: true, unique: true },
    markdown: { type: String, default: '', maxlength: 100000 },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: false }
);

export default mongoose.models.TrainingProofGuide || mongoose.model('TrainingProofGuide', TrainingProofGuideSchema);

import mongoose from 'mongoose';
import { VOLUNTEER_STATUSES } from '../lib/trainingProof/vocab.js';

// מגיה בדף "הגהה לאימון המודלים" (docs/75 ה-1, ה-17; docs/76 §8.1). זו רשימה
// משלה — לא תפקיד במערכת-ההרשאות (roles.js). רשומה נוצרת בבקשת-גישה (pending),
// ובעל הפרויקט מאשר/דוחה/מבטל מתוך מסך הניהול.
// stats — מטמון של המונים לכל חלק, שמסך הניהול רשאי לשמור; מקור-האמת הוא
// הפריטים עצמם (lib/trainingProof/stats.js — volunteerStats).
const TrainingProofVolunteerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: VOLUNTEER_STATUSES, default: 'pending', index: true },
    requestMessage: { type: String, default: '', maxlength: 2000 },
    requestedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Export ids already credited into stats.archived. Keeps retrying a purge
    // idempotent after a process/network failure.
    archivedExports: { type: [String], default: [], select: false },
  },
  { timestamps: false }
);

export default mongoose.models.TrainingProofVolunteer ||
  mongoose.model('TrainingProofVolunteer', TrainingProofVolunteerSchema);

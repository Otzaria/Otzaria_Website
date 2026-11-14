import mongoose from 'mongoose';
import { SECTIONS } from '../lib/trainingProof/vocab.js';

// יומן התיקונים של המנהל (בקשת בעל הפרויקט, 2026-10-28): כל "תקן ואשר" שבו המנהל שינה את
// מה שהמתנדב סימן — מה המתנדב שלח ומה המנהל קבע. הפריט עצמו נמחק מהאתר אחרי ההורדה לתחנה,
// ולכן היומן הוא אוסף משלו; נשמרים רק האחרונים לכל מתנדב (CORRECTIONS_KEEP ב-
// lib/trainingProof/corrections.js). בלי תמונות. "החזר לממתינות" מוחק את הרשומה של הפריט.
const TrainingProofCorrectionSchema = new mongoose.Schema(
  {
    vol: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    section: { type: String, enum: SECTIONS, required: true },
    // רשומה אחת לכל מחזור-חיים של פריט. ה-upsert לפי item הופך את סנכרון היומן
    // ל-idempotent: ניסיון חוזר אחרי כשל אינו יוצר כפילות.
    item: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    uid: { type: String, default: '' },
    alias: { type: String, default: '' },
    page: { type: Number, default: null },
    track: { type: String, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    changes: { type: Number, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
TrainingProofCorrectionSchema.index({ vol: 1, at: -1 });

export default mongoose.models.TrainingProofCorrection ||
  mongoose.model('TrainingProofCorrection', TrainingProofCorrectionSchema);

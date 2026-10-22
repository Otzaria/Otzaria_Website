import mongoose from 'mongoose';

// מתי העובד המקומי (ספק OCR local) פנה לאחרונה ל-API שלו — לתצוגת "המחשב זמין/לא זמין"
// בממשק הניהול בלבד. לעולם לא סיבה לכשל או למחיקה של עבודה.
const OcrWorkerStateSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true },
  lastSeenAt: { type: Date },
  lastRoute: { type: String },
}, { timestamps: true });

export default mongoose.models.OcrWorkerState || mongoose.model('OcrWorkerState', OcrWorkerStateSchema);

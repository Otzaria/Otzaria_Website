import mongoose from 'mongoose';

// דופק ה-worker של תיקוני הטקסט — מוצג ב-health כדי שתור שלא מעובד לא ייראה תקין.
const WorkerHeartbeatSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true },
  lastBeatAt: { type: Date, required: true },
  lastBatch: { type: mongoose.Schema.Types.Mixed, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true });

export default mongoose.models.WorkerHeartbeat || mongoose.model('WorkerHeartbeat', WorkerHeartbeatSchema);

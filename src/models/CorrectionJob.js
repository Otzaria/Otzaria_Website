import mongoose from 'mongoose';
import { JOB_TYPES, JOB_STATUS } from '../lib/corrections/states.js';

// משימת תור עמידה (verify/publish). activeKey קיים רק כל עוד המשימה פעילה, והאינדקס
// הייחודי עליו מונע שתי משימות פעילות לאותה פעולה על אותו דיווח.
const CorrectionJobSchema = new mongoose.Schema({
  type: { type: String, enum: JOB_TYPES, required: true },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'ErrorReport', required: true },
  activeKey: { type: String, default: undefined },
  status: { type: String, enum: JOB_STATUS, default: 'pending' },
  generation: { type: Number, required: true },
  requestId: { type: String, default: null },
  proposalRevision: { type: Number, default: null },
  changeId: { type: String, default: null },
  serviceJobId: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, required: true },
  nextAttemptAt: { type: Date, default: Date.now },
  deadlineAt: { type: Date, required: true },
  leaseOwner: { type: String, default: null },
  leaseExpiresAt: { type: Date, default: null },
  fence: { type: Number, default: 0 },
  // מצב משיכה: hash של אסימון ה-lease שנמסר לשירות (האסימון עצמו אינו נשמר), מונה פקיעות lease,
  // ו-sha256 של גוף התוצאה שנקלטה — שליחה חוזרת של אותו גוף מקבלת את אותה תשובה בלי להחיל שוב.
  leaseTokenHash: { type: String, default: null },
  leaseExpiries: { type: Number, default: 0 },
  resultSha256: { type: String, default: null },
  resultOutcome: { type: String, default: null },
  resultReason: { type: String, default: null },
  lastErrorClass: { type: String, default: null },
  lastError: { type: String, default: null },
  outcome: { type: String, default: null },
  finishedAt: { type: Date, default: null },
}, { timestamps: true });

CorrectionJobSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } });
CorrectionJobSchema.index({ status: 1, type: 1, nextAttemptAt: 1 });
CorrectionJobSchema.index({ status: 1, leaseExpiresAt: 1 });
CorrectionJobSchema.index({ report: 1, createdAt: -1 });

export default mongoose.models.CorrectionJob || mongoose.model('CorrectionJob', CorrectionJobSchema);

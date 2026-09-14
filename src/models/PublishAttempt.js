import mongoose from 'mongoose';

// ניסיון פרסום יחיד. attemptId מופיע בהודעת הקומיט ובשם הענף לצורך reconciliation.
const PublishAttemptSchema = new mongoose.Schema({
  attemptId: { type: String, required: true, unique: true },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'ErrorReport', required: true },
  changeId: { type: String, required: true },
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'CorrectionJob', default: null },
  mode: { type: String, enum: ['pr', 'direct'], required: true },
  repo: { type: String, required: true },
  branch: { type: String, required: true },
  status: { type: String, enum: ['started', 'committed', 'pr_opened', 'already_fixed', 'conflict', 'failed', 'unknown'], default: 'started' },
  commitSha: { type: String, default: null },
  prNumber: { type: Number, default: null },
  prUrl: { type: String, default: null },
  prBranch: { type: String, default: null },
  error: { type: String, default: null },
  finishedAt: { type: Date, default: null },
}, { timestamps: true });

PublishAttemptSchema.index({ report: 1, createdAt: -1 });

export default mongoose.models.PublishAttempt || mongoose.model('PublishAttempt', PublishAttemptSchema);

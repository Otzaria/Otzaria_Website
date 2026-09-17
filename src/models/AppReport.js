import mongoose from 'mongoose';

// דיווח על התוכנה עצמה (לא על ספר). הקבצים ב-GridFS; המייל גלוי למנהל כללי בלבד.
const FileRefSchema = new mongoose.Schema({
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  size: { type: Number, default: 0 },
}, { _id: false });

const ContactEntrySchema = new mongoose.Schema({
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byName: { type: String, default: '' },
  subject: { type: String, maxlength: 200 },
  message: { type: String, maxlength: 5000 },
  sentAt: { type: Date, default: Date.now },
}, { _id: false });

const AppReportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true },
  schema: { type: Number, default: 1 },
  type: { type: String, enum: ['bug', 'crash', 'performance', 'suggestion'], required: true },
  trigger: { type: String, enum: ['manual', 'crash_prompt', 'auto_crash'], required: true },
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, default: '', maxlength: 10000 },
  stepsToReproduce: { type: String, default: '', maxlength: 5000 },
  reporterEmail: { type: String, default: null },
  appVersion: { type: String, maxlength: 50 },
  platform: { type: String, enum: ['windows', 'linux', 'macos', 'android', 'ios', 'other'] },
  osVersion: { type: String, default: '', maxlength: 200 },
  arch: { type: String, default: '', maxlength: 20 },
  signature: {
    type: new mongoose.Schema({ exceptionType: String, frames: [String] }, { _id: false }),
    default: null,
  },
  sentryEventId: { type: String, default: '', maxlength: 64 },
  clientCreatedAt: { type: Date, default: null },

  contentHash: { type: String, required: true },
  signatureHash: { type: String, default: null },

  issueNumber: { type: Number, default: null },
  issueUrl: { type: String, default: null },
  issueState: { type: String, enum: ['open', 'closed', null], default: null },
  issueStateReason: { type: String, default: null },
  issuePending: { type: Boolean, default: true },
  // נעילה קצרה כדי שה-cron והקליטה לא ייצרו issue כפול לאותו דיווח
  issueLeaseUntil: { type: Date, default: null },
  issueError: { type: String, default: null },
  issueAttemptAt: { type: Date, default: null },
  issueCheckedAt: { type: Date, default: null },
  mergedIntoExisting: { type: Boolean, default: false },
  previousIssueNumber: { type: Number, default: null },

  fileIds: {
    diagnostics: { type: FileRefSchema, default: null },
    errors: { type: FileRefSchema, default: null },
  },
  contactLog: { type: [ContactEntrySchema], default: [] },
  notifiedClosedAt: { type: Date, default: null },
  unsubscribed: { type: Boolean, default: false },
}, { timestamps: true });

AppReportSchema.index({ signatureHash: 1 });
AppReportSchema.index({ issueNumber: 1 });
AppReportSchema.index({ issuePending: 1, issueAttemptAt: 1, createdAt: 1 });
AppReportSchema.index({ createdAt: -1 });

export default mongoose.models.AppReport || mongoose.model('AppReport', AppReportSchema);

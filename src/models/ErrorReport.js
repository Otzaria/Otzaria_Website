import mongoose from 'mongoose';
import {
  VERIFICATION_STATUS, EXTERNAL_STATUS, EXTERNAL_TARGETS, APPROVAL_AUTHORITY, APPROVAL_SCOPE, MANUAL_STATUS, PUBLISH_STATUS, INCLUSION_STATUS, REPORT_STATE,
} from '../lib/corrections/states.js';

// גרסת הצעה — בלתי משתנה אחרי יצירתה; עריכה יוצרת revision חדשה.
const ProposalSchema = new mongoose.Schema({
  revision: { type: Number, required: true },
  author: { type: String, enum: ['user', 'service', 'volunteer'], required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  authorName: { type: String, default: null },
  originalLine: { type: String, required: true },
  originalSelection: { type: String, default: null },
  selectionOffset: { type: { unit: String, start: Number, end: Number, _id: false }, default: null },
  proposedText: { type: String, default: null },
  contextBefore: { type: String, default: '' },
  contextAfter: { type: String, default: '' },
  targetPath: { type: String, default: null },
  targetLineIndex: { type: Number, default: null },
  note: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const DecisionSchema = new mongoose.Schema({
  decisionId: String,
  source: { type: String, enum: ['service', 'volunteer', 'system'] },
  decision: String,
  scope: String,
  reasonCode: String,
  message: String,
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: String,
  revision: Number,
  generation: Number,
  changeId: String,
  stale: { type: Boolean, default: false },
  at: { type: Date, default: Date.now },
}, { _id: false });

const ErrorReportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true }, // מזהה ייחודי לדיווח (client_report_id)
  senderEmail: { type: String, required: true }, // כתובת השולח
  subject: { type: String, required: true }, // נושא הדיווח
  bookTitle: { type: String, required: true }, // שם הספר
  currentRef: { type: String, required: true }, // מיקום בספר
  lineNumber: { type: Number, required: true }, // מספר שורה (לתצוגה בלבד)
  selectedText: { type: String, required: true }, // הטקסט המסומן (צילום תצוגה, לא מקור)
  errorDetails: { type: String, required: true }, // פירוט הטעות
  contextText: { type: String, required: true }, // טקסט הקשר
  filePath: { type: String, required: true }, // נתיב הקובץ (יחסי לספרייה, לא נתיב Git)
  sourceFolder: { type: String, required: true }, // תיקיית המקור
  libraryVersion: { type: String, default: 'unknown' }, // גרסת ספרייה של המשתמש
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'rejected'],
    default: 'pending'
  }, // סטטוס ישן — מסונכרן מ-state לתאימות
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // למי הוקצה הדיווח
  adminNotes: { type: String }, // הערות מנהל
  resolvedAt: { type: Date }, // תאריך פתרון
  emailSent: { type: Boolean, default: false }, // האם נשלח מייל
  emailSentAt: { type: Date }, // תאריך שליחת המייל

  // ---- מערכת תיקוני הטקסט (כל השדות אופציונליים; דיווח ישן = free_text) ----
  schemaVersion: { type: Number, default: 1 },
  reportKind: { type: String, enum: ['free_text', 'text_correction'], default: 'free_text' },
  contentDigest: { type: String, default: null },
  location: {
    type: { lineIndex: Number, bookId: Number, libraryBuildId: String, heRef: String, _id: false },
    default: null,
  },
  sourceHint: {
    type: { sourceFolder: String, sourceName: String, libraryRelativePath: String, repoPath: String, _id: false },
    default: null,
  },
  client: { type: { appVersion: String, platform: String, _id: false }, default: null },
  proposals: { type: [ProposalSchema], default: undefined },
  currentRevision: { type: Number, default: 0 },
  workflowGeneration: { type: Number, default: 0 },
  state: { type: String, enum: REPORT_STATE },
  resolvedSource: { type: mongoose.Schema.Types.Mixed, default: null },
  verification: {
    status: { type: String, enum: VERIFICATION_STATUS },
    requestId: String,
    requestedScope: String,
    attempts: Number,
    lastErrorClass: String,
    lastError: String,
    nextAttemptAt: Date,
    decisionId: String,
    decision: String,
    reasonCode: String,
    message: String,
    authorityExceeded: Boolean,
    completedAt: Date,
  },
  approval: {
    authority: { type: String, enum: APPROVAL_AUTHORITY },
    scope: { type: String, enum: APPROVAL_SCOPE },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    at: Date,
    revision: Number,
    changeId: String,
  },
  manual: {
    status: { type: String, enum: MANUAL_STATUS },
    handoffReason: String,
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assigneeName: String,
    claimedAt: Date,
    leaseExpiresAt: Date,
    queuedAt: Date,
  },
  publish: {
    status: { type: String, enum: PUBLISH_STATUS },
    changeId: String,
    attemptId: String,
    attempts: Number,
    lastError: String,
    conflictReason: String,
    commitSha: String,
    prNumber: Number,
    prUrl: String,
    branch: String,
    updatedAt: Date,
  },
  inclusion: {
    status: { type: String, enum: INCLUSION_STATUS },
    releaseId: String,
    at: Date,
  },
  // ספרי ספריא: חבילת איתור חיצונית (לא פורמט המחולל — ראו buildExternalSefariaPackage).
  external: {
    target: { type: String, enum: EXTERNAL_TARGETS },
    status: { type: String, enum: EXTERNAL_STATUS },
    package: { type: mongoose.Schema.Types.Mixed },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedByName: String,
    decidedAt: Date,
    note: String,
  },
  // outbox: הצורך בעיבוד נשמר באותו מסמך כמו הדיווח (קליטה אטומית בלי טרנזקציה).
  dispatch: {
    verify: Boolean,
    publish: Boolean,
  },
  decisions: { type: [DecisionSchema], default: undefined },
  closedAt: Date,
  closeReason: String,
}, { timestamps: true });

// אינדקס לחיפוש מהיר (reportId מקבל אינדקס אוטומטית דרך unique: true בהגדרת השדה)
ErrorReportSchema.index({ senderEmail: 1 });
ErrorReportSchema.index({ bookTitle: 1 });
ErrorReportSchema.index({ status: 1 });
ErrorReportSchema.index({ createdAt: -1 });
ErrorReportSchema.index({ state: 1, 'manual.status': 1, createdAt: -1 });
ErrorReportSchema.index({ 'dispatch.verify': 1 }, { partialFilterExpression: { 'dispatch.verify': true } });
ErrorReportSchema.index({ 'dispatch.publish': 1 }, { partialFilterExpression: { 'dispatch.publish': true } });
ErrorReportSchema.index({ 'publish.status': 1 });
ErrorReportSchema.index({ 'external.status': 1 });

export default mongoose.models.ErrorReport || mongoose.model('ErrorReport', ErrorReportSchema);

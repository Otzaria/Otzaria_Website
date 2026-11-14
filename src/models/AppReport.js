import mongoose from 'mongoose';
import { PRODUCT_KEYS, DEFAULT_PRODUCT } from '../lib/app-reports/products.js';

// דיווח על התוכנה עצמה (לא על ספר). הקבצים ב-GridFS; המייל גלוי למנהל כללי בלבד.
const FileRefSchema = new mongoose.Schema({
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  size: { type: Number, default: 0 },
}, { _id: false });

// minidump של קריסה נייטיבית: באתר בלבד, לא ב-GitHub — מכיל זיכרון של התהליך.
const MinidumpRefSchema = new mongoose.Schema({
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  size: { type: Number, default: 0 },
  fileName: { type: String, default: '' },
}, { _id: false });

const ImageRefSchema = new mongoose.Schema({
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  size: { type: Number, default: 0 },
  mimeType: { type: String, required: true },
  fileName: { type: String, default: '' },
  // מזהה אקראי לקישור הציבורי שמוטמע ב-issue; לא ניתן לגזור אותו מהדיווח.
  publicToken: { type: String, required: true },
}, { _id: false });

// תמונה מתשובת מדווח במייל; טוקן ציבורי רק לתשובה מכתובת המדווח (רק היא מתפרסמת ב-issue)
const ReplyImageRefSchema = new mongoose.Schema({
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  size: { type: Number, default: 0 },
  mimeType: { type: String, required: true },
  fileName: { type: String, default: '' },
  publicToken: { type: String, default: undefined },
}, { _id: false });

// out = פנייה של הצוות; in = תשובת המדווח במייל (נקלטה דרך כתובת ה-reply+)
const ContactEntrySchema = new mongoose.Schema({
  direction: { type: String, enum: ['out', 'in'], default: 'out' },
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byName: { type: String, default: '' },
  subject: { type: String, maxlength: 200 },
  message: { type: String, maxlength: 10000 },
  sentAt: { type: Date, default: Date.now },
  // שדות התשובה הנכנסת בלבד
  fromEmail: { type: String, default: undefined },
  messageId: { type: String, default: undefined },
  attachments: { type: Number, default: undefined },
  images: { type: [ReplyImageRefSchema], default: undefined },
  // pending → posting → posted; held = נשלח מכתובת אחרת מזו של המדווח, לא מתפרסם אוטומטית
  issueComment: { type: String, enum: ['pending', 'posting', 'posted', 'held'], default: undefined },
  issueCommentUrl: { type: String, default: undefined },
}, { _id: false });

// קובץ שכבר נותק אטומית וממתין למחיקה או להעברת בעלות לדיווח שמשתף אותו.
// הרשומה מאפשרת להשלים את פעולת האחסון אחרי קריסה או כשל זמני.
const PendingPayloadDeleteSchema = new mongoose.Schema({
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  ownerReportId: { type: String, required: true },
  size: { type: Number, default: 0 },
  kinds: { type: [String], default: [] },
  detachedAt: { type: Date, required: true },
  leaseToken: { type: String, default: null },
  leaseUntil: { type: Date, default: null },
}, { _id: false });

const PayloadCleanupSchema = new mongoose.Schema({
  leaseToken: { type: String, default: null },
  leaseUntil: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: null },
  lastAttemptAt: { type: Date, default: null },
  lastError: { type: String, default: null },
  purgedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  removedFiles: { type: Number, default: 0 },
  removedBytes: { type: Number, default: 0 },
  sharedFiles: { type: Number, default: 0 },
  missingFiles: { type: Number, default: 0 },
  kinds: { type: [String], default: [] },
  pendingDeletes: { type: [PendingPayloadDeleteSchema], default: [] },
}, { _id: false });

const AppReportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true },
  schema: { type: Number, default: 1 },
  // המוצר המדווח (products.js). מסמכים ישנים בלי השדה שייכים לאוצריא — שאילתות דרך productFilter.
  product: { type: String, enum: PRODUCT_KEYS, default: DEFAULT_PRODUCT },
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
  resendHash: { type: String, default: null },

  issueNumber: { type: Number, default: null },
  issueUrl: { type: String, default: null },
  issueState: { type: String, enum: ['open', 'closed', null], default: null },
  issueStateReason: { type: String, default: null },
  issueClosedAt: { type: Date, default: null },
  // מונה מעברי מצב: גם reopen+close באותו tick מבטלים תשובת GET ישנה של ניקוי.
  issueStateRevision: { type: Number, default: 0 },
  issuePending: { type: Boolean, default: true },
  // נעילה קצרה כדי שה-cron והקליטה לא ייצרו issue כפול לאותו דיווח
  issueLeaseUntil: { type: Date, default: null },
  issueError: { type: String, default: null },
  issueAttemptAt: { type: Date, default: null },
  issueCheckedAt: { type: Date, default: null },
  mergedIntoExisting: { type: Boolean, default: false },
  // צורף בשקט ל-issue סגור (גרסה שאינה חדשה מהמקושרות אליו), בלי issue חדש ובלי תגובה
  suppressedAfterClose: { type: Boolean, default: false },
  previousIssueNumber: { type: Number, default: null },

  fileIds: {
    diagnostics: { type: FileRefSchema, default: null },
    errors: { type: FileRefSchema, default: null },
    minidump: { type: MinidumpRefSchema, default: null },
    images: { type: [ImageRefSchema], default: [] },
  },
  contactLog: { type: [ContactEntrySchema], default: [] },
  // החלק המקומי של כתובת המענה (reply+<replyToken>@...). נוצר בפנייה הראשונה; בלי default כדי שהאינדקס הייחודי לא יתנגש ב-null.
  replyToken: { type: String },
  lastInboundAt: { type: Date, default: null },
  notifiedClosedAt: { type: Date, default: null },
  unsubscribed: { type: Boolean, default: false },
  payloadCleanup: { type: PayloadCleanupSchema, default: () => ({}) },
}, { timestamps: true });

// מספרי issue וחתימות אינם ייחודיים בין מוצרים (ריפו נפרד לכל מוצר)
AppReportSchema.index({ product: 1, signatureHash: 1 });
AppReportSchema.index({ product: 1, issueNumber: 1 });
AppReportSchema.index({ issuePending: 1, issueAttemptAt: 1, createdAt: 1 });
AppReportSchema.index({ createdAt: -1 });
AppReportSchema.index({ resendHash: 1, createdAt: -1 });
// בדיקת בעלות לפני ניקוי צרופות זמניות: כל ענפי ה-$or חייבים אינדקס,
// אחרת כל קובץ שנשמר במרוץ גורר סריקה של כל הדיווחים.
for (const path of ['fileIds.diagnostics.gridfsId', 'fileIds.errors.gridfsId', 'fileIds.minidump.gridfsId', 'fileIds.images.gridfsId', 'contactLog.images.gridfsId']) {
  AppReportSchema.index({ [path]: 1 }, { sparse: true });
}
AppReportSchema.index({ 'fileIds.images.publicToken': 1 }, { sparse: true });
AppReportSchema.index({ 'contactLog.images.publicToken': 1 }, { sparse: true });
AppReportSchema.index({ replyToken: 1 }, { unique: true, partialFilterExpression: { replyToken: { $type: 'string' } } });

AppReportSchema.index({ issueState: 1, issuePending: 1, 'payloadCleanup.purgedAt': 1, 'payloadCleanup.nextAttemptAt': 1, issueClosedAt: 1 });
AppReportSchema.index({ 'payloadCleanup.pendingDeletes.gridfsId': 1 }, { sparse: true });
AppReportSchema.index({ 'payloadCleanup.nextAttemptAt': 1 }, {
  partialFilterExpression: { 'payloadCleanup.pendingDeletes.0': { $exists: true } },
});

export default mongoose.models.AppReport || mongoose.model('AppReport', AppReportSchema);

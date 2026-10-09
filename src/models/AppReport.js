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
  // pending → posting → posted; held = נשלח מכתובת אחרת מזו של המדווח, לא מתפרסם אוטומטית
  issueComment: { type: String, enum: ['pending', 'posting', 'posted', 'held'], default: undefined },
  issueCommentUrl: { type: String, default: undefined },
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
    minidump: { type: MinidumpRefSchema, default: null },
    images: { type: [ImageRefSchema], default: [] },
  },
  contactLog: { type: [ContactEntrySchema], default: [] },
  // החלק המקומי של כתובת המענה (reply+<replyToken>@...). נוצר בפנייה הראשונה; בלי default כדי שהאינדקס הייחודי לא יתנגש ב-null.
  replyToken: { type: String },
  lastInboundAt: { type: Date, default: null },
  notifiedClosedAt: { type: Date, default: null },
  unsubscribed: { type: Boolean, default: false },
}, { timestamps: true });

// מספרי issue וחתימות אינם ייחודיים בין מוצרים (ריפו נפרד לכל מוצר)
AppReportSchema.index({ product: 1, signatureHash: 1 });
AppReportSchema.index({ product: 1, issueNumber: 1 });
AppReportSchema.index({ issuePending: 1, issueAttemptAt: 1, createdAt: 1 });
AppReportSchema.index({ createdAt: -1 });
AppReportSchema.index({ 'fileIds.images.publicToken': 1 }, { sparse: true });
AppReportSchema.index({ replyToken: 1 }, { unique: true, partialFilterExpression: { replyToken: { $type: 'string' } } });

export default mongoose.models.AppReport || mongoose.model('AppReport', AppReportSchema);

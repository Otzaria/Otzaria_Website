import mongoose from 'mongoose';
// נתיב יחסי (לא '@/') — המודל נטען גם בטסטי node:test ובסקריפט המיגרציה
import { ALL_STATUSES } from '../lib/ocr/localJobState.js';

// עבודת OCR על ספר שלם. שלושה ספקים:
// - gemini / ocrwin: רצים ברקע בתהליך השרת (runOcrJob), במצב 'running' בלבד עד הסיום.
// - local: עיבוד במחשב מקומי (שירות OtzariaTaskAgent) — השרת מכין PDF, העובד מושך
//   אותו דרך /api/worker/v1, מדווח מצב ומחזיר תוצאה. ראו src/lib/ocr/localJobState.js
//   למצבים, למיפויים ולהגדרת "פעיל".
// הנהלת הספרים מתחילה עבודה, יכולה לעזוב את החלון ולחזור לראות התקדמות (polling על status).
// רשימת המצבים והחלוקה לפעילים/סופיים — localJobState.js (מקור אמת יחיד).

const OptionsSchema = new mongoose.Schema({
  lm: { type: String, enum: ['rabbinic', 'modern', 'off'] },
  defaultScript: { type: String, enum: ['square', 'rashi'] },
}, { _id: false });

// רשומה אחת לכל עמוד ב-PDF הקלט (pdfPageIndex מ-1). expectedUpdatedAt — updatedAt של
// העמוד ברגע היצירה; ההחלה מותנית בו (עמוד שנערך בינתיים → התנגשות, לא דריסה).
const PageMapEntrySchema = new mongoose.Schema({
  pdfPageIndex: { type: Number },
  page: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
  pageNumber: { type: Number },
  expectedUpdatedAt: { type: Date },
  imageSha256: { type: String },
}, { _id: false });

// גוף ה-ack שנשמר ומוחזר כמו שהוא לעובד (ack.schema.json בחוזה השירות)
const AckSchema = new mongoose.Schema({
  ack: { type: String },
  jobId: { type: String },
  resultSha256: { type: String },
  outcome: { type: String },
}, { _id: false });

// תוצאה עם hash שונה שהגיעה אחרי שכבר ננעלה תוצאה — נשמרת לבדיקה, לא מוחלת
const ResultConflictSchema = new mongoose.Schema({
  sha256: { type: String },
  receivedAt: { type: Date },
  bytes: { type: Number },
  path: { type: String },
  // סומנה "נבדק" בממשק הניהול — רק אז הניקוי (localCleanup) מוחק את קובץ ה-rejected-<sha>.json
  reviewedAt: { type: Date },
  reviewedByName: { type: String },
}, { _id: false });

// קובץ תוצאה שנדחה בקליטה (400 invalid_result / 422 validation_failed / 410 job_closed) — נשמר
// לבירור כ-rejected-<sha>.json, לא נועל את resultSha256 ולא מוחל
const ResultRejectionSchema = new mongoose.Schema({
  sha256: { type: String },
  receivedAt: { type: Date },
  bytes: { type: Number },
  path: { type: String },
  reason: { type: String },
  details: { type: String },
}, { _id: false });

const OcrJobSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  bookName: { type: String, default: '' },
  bookSlug: { type: String, default: '' },

  method: { type: String, enum: ['gemini', 'ocrwin', 'local'], required: true },
  model: { type: String, default: '' },            // ל-gemini בלבד
  existingTextMode: { type: String, enum: ['overwrite', 'skip'], default: 'skip' },
  splitColumns: { type: Boolean, default: false }, // חיתוך כל עמוד ל-2 טורים (ימין/שמאל) לפני OCR

  status: {
    type: String,
    enum: ALL_STATUSES,
    default: 'running',
    index: true,
  },

  // true כל עוד העבודה פעילה (חוסמת עבודה נוספת לאותו ספר — אינדקס book_active_unique).
  // כל מסלול סיום/ביטול/כשל — בכל הספקים — חייב לקבוע active:false באותה פעולה.
  active: { type: Boolean, default: false },

  totalPages: { type: Number, default: 0 },         // כמה עמודים בפועל יעובדו
  processedPages: { type: Number, default: 0 },
  successPages: { type: Number, default: 0 },
  failedPages: { type: Number, default: 0 },
  editedPagesCount: { type: Number, default: 0 },   // כמה עמודים כבר היה בהם טקסט (לתצוגה)
  currentPageNumber: { type: Number, default: 0 },

  cancelRequested: { type: Boolean, default: false },
  error: { type: String, default: '' },             // שגיאה כללית שעצרה את כל העבודה
  // קוד מכונה לשגיאה (local: כשל קבוע בהכנת הקלט, למשל missing_image / prep_abandoned) —
  // ניסיון חוזר עם אותו requestId מחזיר את אותה תשובה בדיוק (localJobCreate)
  errorCode: { type: String },
  // שגיאות נקודתיות לעמודים. code — קוד השגיאה מהעובד (מנוקה), או 'page_missing' לעמוד שנמחק
  pageErrors: [{ pageNumber: Number, code: String, message: String }],

  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  startedByName: { type: String, default: '' },
  finishedAt: { type: Date },

  // ---- ספק local (עובד מקומי) ----
  taskType: { type: String, default: 'ocr' },
  requestId: { type: String },                      // מזהה בקשת היצירה מהלקוח (אידמפוטנטיות)
  requestFingerprint: { type: String },             // sha256 של פרמטרי הבקשה — אותו requestId לבקשה אחרת → 409
  workerId: { type: String },
  options: { type: OptionsSchema },

  // קלט (PDF) — נתיב יחסי לשורש האחסון הפרטי (OCR_LOCAL_STORAGE_DIR), לא תחת public
  inputPath: { type: String },
  inputSha256: { type: String },
  inputBytes: { type: Number },
  preparedAt: { type: Date },
  prepLeaseUntil: { type: Date },
  pageMap: { type: [PageMapEntrySchema], default: undefined },

  // דיווחי מצב מהעובד (reportSeq עולה בלבד — דיווח ישן לא דורס חדש)
  reportSeq: { type: Number, default: 0 },
  workerState: { type: String },
  attempt: { type: Number },
  progressPhase: { type: String },
  progressPagesTotal: { type: Number },
  workerMessage: { type: String },
  lastSeenAt: { type: Date },                       // לתצוגה בלבד — לעולם לא סיבה לכשל/מחיקה
  startedAt: { type: Date },

  // נעילת החלטה: ביטול מול החלת תוצאה — הראשון שנועל גובר
  decision: { type: String, enum: ['cancel', 'apply', null], default: null },
  cancelledAt: { type: Date },
  cancelReason: { type: String, enum: ['admin', 'book_deleted', 'book_merged'] },
  cancelledByName: { type: String },

  // תוצאה
  resultSha256: { type: String },
  resultOutcome: { type: String, enum: ['success', 'partial', 'failed', 'cancelled'] },
  resultPath: { type: String },
  resultBytes: { type: Number },
  resultReceivedAt: { type: Date },
  pipelineVersion: { type: String },
  // metadata הספר מהתוצאה כ-JSON (localResultLayout.pure.js → bookMetadataJson): המלא, או תת-קבוצה
  // קבועה כשהמלא מעל 512KiB (resultMetadataTruncated). נשמר בנעילת ה-hash, לכל outcome.
  resultMetadataJson: { type: String },
  resultMetadataTruncated: { type: Boolean },
  // error העליון של התוצאה (לכל outcome — גם partial אחרי מיצוי ניסיונות), מנוקה ומקוצר ל-500
  resultError: { type: new mongoose.Schema({ code: String, message: String }, { _id: false }), default: undefined },
  // סיכום נתוני הפריסה בסגירה: ok — נשמר layout; absent — אין layout בלי סיבה; dropped — layout שנפסל
  // באתר או שהעובד השמיט (אזהרת layout_*)
  layoutSummary: { type: new mongoose.Schema({ ok: Number, absent: Number, dropped: Number }, { _id: false }), default: undefined },
  applyStartedAt: { type: Date },
  applyLeaseUntil: { type: Date },
  ack: { type: AckSchema, default: null },
  ackAt: { type: Date },
  conflictPages: { type: Number, default: 0 },
  missingPages: { type: Number, default: 0 },
  resultConflicts: { type: [ResultConflictSchema], default: undefined },
  resultRejections: { type: [ResultRejectionSchema], default: undefined },

  // השלמת קליטה תקועה מהקובץ השמור (cron, resumeStalledApplies) שנכשלה — למשל result_unavailable /
  // result_corrupt. העבודה לא נסגרת: היא נדחית עד resumeRetryAt (המתנה מוכפלת עד יממה, ראו
  // resumeRetryDelayMs ב-localApply.pure.js) כדי שלא תחסום עבודות אחרות, ותנוסה שוב אחר כך (למשל
  // אחרי שחזור הקובץ מגיבוי). נשארים גם אחרי ack — היסטוריה; הממשק מציג אותם רק לעבודה בלי ack.
  resumeErrorCode: { type: String },
  resumeFailedAt: { type: Date },
  resumeFailures: { type: Number },
  resumeRetryAt: { type: Date },

  // ניקוי קבצים (cron /api/cron/ocr-local-cleanup, src/lib/ocr/localCleanup.js) — רק קבצים נמחקים,
  // הרשומה וה-ack נשמרים בלי TTL. filesCheckedAt — הבדיקה האחרונה של התיקייה; filesPurgedAt —
  // התיקייה התרוקנה ונמחקה (null אם נשארו בה קבצים, למשל תוצאה מתנגשת שטרם נבדקה).
  inputPurgedAt: { type: Date },
  resultPurgedAt: { type: Date },
  filesCheckedAt: { type: Date },
  filesPurgedAt: { type: Date },
}, { timestamps: true });

// שליפה מהירה של העבודה האחרונה / הפעילה לכל ספר
OcrJobSchema.index({ book: 1, createdAt: -1 });

// מבטיח עבודה פעילה אחת בלבד לכל ספר ברמת ה-DB (מונע race בין שתי בקשות start).
// אינדקס חלקי על active:true — עבודות שהסתיימו (active:false) לא חוסמות חדשות.
// מחליף את האינדקס הישן { book:1 } partial { status:'running' }; ההחלפה בפועל ב-DB נעשית
// בסקריפט scripts/migrate-ocr-local.mjs (בודק כפילויות קודם, dry-run כברירת מחדל).
OcrJobSchema.index(
  { book: 1 },
  { name: 'book_active_unique', unique: true, partialFilterExpression: { active: true } }
);

// requestId ייחודי רק כשקיים (עבודות gemini/ocrwin וישנות — בלי requestId)
OcrJobSchema.index(
  { requestId: 1 },
  { name: 'requestId_unique', unique: true, partialFilterExpression: { requestId: { $type: 'string' } } }
);

// רשימת העבודות לעובד (GET /api/worker/v1/jobs — דפדוף לפי _id). משרת גם את שני ענפי ה-$or
// של activeFilter (שוויון על method/workerId/active, טווח ומיון על _id → SORT_MERGE בלי מיון
// בזיכרון; נבדק ב-explain ב-src/app/api/worker/v1/jobs/route.test.js).
// כל אינדקס שנוסף כאן חייב להיכנס גם ל-TARGET_INDEXES (ocrJobMigration.js) — נבדק בטסט.
OcrJobSchema.index({ method: 1, workerId: 1, active: 1, _id: 1 });

// ניקוי קבצים אחרי ack (cron)
OcrJobSchema.index({ method: 1, active: 1, ackAt: 1 });

export default mongoose.models.OcrJob || mongoose.model('OcrJob', OcrJobSchema);

import mongoose from 'mongoose';

// צורת הדף — החלטת נוסח אחת (PACKAGE.md §1 items.jsonl, §2). sourceKey ייחודי בכל האתר.
// answers — תשובה אחת לכל משתמש, נוספת אטומית ($push עם answers.user $ne); decision — ההסכמה (agreed);
// resolved — הכרעת מנהל. pointsAwarded — הנקודות על ההסכמה חולקו (מתהפך באותו עדכון מותנה).
// practice — פריט תרגול (practice.jsonl): לא בתור ולא בייצוא; expected/expectedText/explain — התשובה וההסבר.
// עדכונים מותנים בלבד — לעולם לא doc.save().
const answerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    who: { type: String, default: '' },
    name: { type: String, default: '' },
    verdict: { type: String, enum: ['print', 'otz', 'other', 'elsewhere', 'unclear'], required: true },
    text: { type: String, default: null },
    via: { type: String, enum: ['fast', 'page'], default: 'fast' },
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'TzuratSubmission', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const boxSchema = new mongoose.Schema({ x: Number, y: Number, w: Number, h: Number }, { _id: false });

const TzuratItemSchema = new mongoose.Schema(
  {
    sourceKey: { type: String, required: true },
    revision: { type: Number, default: 0 },
    slug: { type: String, required: true },
    masechet: { type: String, default: '' },
    daf: { type: String, default: '' },
    dafKey: { type: String, required: true },
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'TzuratPage', default: null },
    kind: { type: String, default: 'g' },
    cls: { type: String, default: '' },
    question: { type: String, enum: ['replace', 'print_only', 'otz_only', 'paren'], default: 'replace' },
    ref: { type: String, default: '' },
    wi: { type: Number, default: 0 },
    n: { type: Number, default: 0 },
    otz: { type: [String], default: [] },
    print: { type: [String], default: [] },
    ctxBefore: { type: [String], default: [] },
    ctxAfter: { type: [String], default: [] },
    box: { type: boxSchema, default: null },
    score: { type: Number, default: 0 },
    hints: { type: mongoose.Schema.Types.Mixed, default: null },
    manual: { type: Boolean, default: false },
    answers: { type: [answerSchema], default: [] },
    status: { type: String, enum: ['open', 'agreed', 'disputed', 'resolved', 'flagged', 'obsolete'], default: 'open' },
    decision: { type: new mongoose.Schema({ verdict: String, text: String, at: Date }, { _id: false }), default: null },
    resolved: {
      type: new mongoose.Schema(
        { verdict: String, text: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, byName: String, at: Date },
        { _id: false }
      ),
      default: null,
    },
    flag: {
      type: new mongoose.Schema({ reason: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: Date }, { _id: false }),
      default: null,
    },
    // סימוני "החיתוך לא מראה" (משתמש אחד פעם אחת); flagged אחרי שני משתמשים (items.flagItem)
    flags: {
      type: [new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reason: String, at: Date }, { _id: false })],
      default: [],
    },
    // ההכרעה יצאה בייצוא — אם תיפתח מחדש, הייצוא הבא (since) יוציא ביטול (retracted)
    exportedDecision: { type: Boolean, default: false },
    leasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    leasedUntil: { type: Date, default: null },
    pointsAwarded: { type: Boolean, default: false },
    buildId: { type: String, default: '' },
    practice: { type: Boolean, default: false },
    expected: { type: String, default: null },
    expectedText: { type: String, default: null },
    explain: { type: String, default: '' },
  },
  { timestamps: true }
);

TzuratItemSchema.index({ sourceKey: 1 }, { unique: true });
TzuratItemSchema.index({ status: 1, kind: 1, score: -1, _id: 1 });
TzuratItemSchema.index({ status: 1, score: -1, _id: 1 });
TzuratItemSchema.index({ page: 1 });
TzuratItemSchema.index({ 'answers.user': 1 });
TzuratItemSchema.index({ slug: 1, status: 1 });
TzuratItemSchema.index({ updatedAt: 1, _id: 1 });

export default mongoose.models.TzuratItem || mongoose.model('TzuratItem', TzuratItemSchema);

import mongoose from 'mongoose';

// צורת הדף — עמוד לבדיקה. ייחודי {slug, dafKey}. model — מודל העמוד מהחבילה (PACKAGE.md §1).
// בדיקת עמוד: required (1/2) מקומות; activeCount — הגשות שתפסו מקום (submitted/approved); approvedCount —
// שאושרו; done כשהמאושרות ≥ required. submitters — מי שהגיש בסבב הנוכחי (לא יקבל אותו שוב עד שיידחה).
// עדכונים מותנים בלבד (findOneAndUpdate/updateOne) — לעולם לא doc.save().
const imageSchema = new mongoose.Schema(
  { path: { type: String, default: '' }, w: { type: Number, default: 0 }, h: { type: Number, default: 0 } },
  { _id: false }
);

const TzuratPageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    masechet: { type: String, default: '' },
    daf: { type: String, default: '' },
    dafKey: { type: String, required: true },
    order: { type: Number, default: 0 },
    buildId: { type: String, default: '' },
    pdf: { type: new mongoose.Schema({ file: String, page: Number }, { _id: false }), default: null },
    scan: { type: imageSchema, default: null },
    ours: { type: imageSchema, default: null },
    nonVilna: { type: Boolean, default: false },
    model: { type: mongoose.Schema.Types.Mixed, default: null },
    pendingCount: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'done', 'closed'], default: 'open' },
    round: { type: Number, default: 1 },
    required: { type: Number, default: 1 },
    activeCount: { type: Number, default: 0 },
    approvedCount: { type: Number, default: 0 },
    submitters: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // נשמרים רק לסבב הנוכחי ומתאפסים בבנייה חדשה; מונעים כפל מונים בחידוש review.
    approvalEvents: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    releaseEvents: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    leasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    leasedUntil: { type: Date, default: null },
    changedInRound: { type: Boolean, default: false },
    // הסבב נפתח מסנכרון (reports.applySync): {note, buildId, at} — לזיהוי בקשה חוזרת
    reopen: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, minimize: false }
);

TzuratPageSchema.index({ slug: 1, dafKey: 1 }, { unique: true });
TzuratPageSchema.index({ status: 1, leasedUntil: 1 });
TzuratPageSchema.index({ leasedBy: 1, leasedUntil: 1 });
TzuratPageSchema.index({ slug: 1, order: 1 });

export default mongoose.models.TzuratPage || mongoose.model('TzuratPage', TzuratPageSchema);

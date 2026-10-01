import mongoose from 'mongoose'

/**
 * סל שינויי כינויים שנשלח כ-PR לפורק Otzaria/SeforimAcronymizer (src/lib/acronyms/fork.js).
 * ops נשמרים כדי שה-PR ייבנה מחדש מעל master אחרי כל מיזוג.
 */
const AcronymChangeSetSchema = new mongoose.Schema(
  {
    ops: { type: [mongoose.Schema.Types.Mixed], required: true },
    kind: { type: String, enum: ['user', 'legacy_pending', 'legacy_approved'], default: 'user' },
    label: { type: String, trim: true, default: '' },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    status: {
      type: String,
      enum: ['publishing', 'open', 'merged', 'closed', 'modified', 'failed'],
      default: 'publishing',
      index: true,
    },
    branch: { type: String, default: null },
    prNumber: { type: Number, default: null },
    prUrl: { type: String, default: null },
    baseSha: { type: String, default: null },
    headSha: { type: String, default: null },
    counts: { add: Number, remove: Number, rename: Number, noop: Number },
    books: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    legacyPendingIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
  },
  { timestamps: true }
)

AcronymChangeSetSchema.index({ submittedBy: 1, createdAt: -1 })

export default mongoose.models.AcronymChangeSet || mongoose.model('AcronymChangeSet', AcronymChangeSetSchema)

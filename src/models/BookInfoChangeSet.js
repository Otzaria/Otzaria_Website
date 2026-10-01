import mongoose from 'mongoose'

/**
 * עריכת "מידע על ספרים" שנשלחה כ-PR לריפו Otzaria/otzaria-library (src/lib/bookinfo/fork.js).
 * ops נשמרים כדי שה-PR ייבנה מחדש מעל main אחרי כל מיזוג.
 */
const BookInfoChangeSetSchema = new mongoose.Schema(
  {
    ops: { type: [mongoose.Schema.Types.Mixed], required: true },
    // מפתח הספר (שם+מחבר) של העריכה, לחסימת שני PR-ים פתוחים על אותה שורה
    bookKey: { type: String, required: true, index: true },
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
    lastError: { type: String, default: null },
  },
  { timestamps: true }
)

BookInfoChangeSetSchema.index({ submittedBy: 1, createdAt: -1 })

export default mongoose.models.BookInfoChangeSet || mongoose.model('BookInfoChangeSet', BookInfoChangeSetSchema)

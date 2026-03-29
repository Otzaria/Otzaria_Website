import mongoose from 'mongoose'

const BookAcronymPendingSuggestionSchema = new mongoose.Schema(
  {
    bookAcronym: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookAcronym',
      required: true,
      index: true
    },
    // Kept for backward compatibility with older pending documents and indexes.
    alias: { type: String, trim: true, default: null },
    actionType: {
      type: String,
      enum: ['add', 'update', 'delete'],
      default: 'add',
      required: true
    },
    currentAlias: { type: String, trim: true, default: null },
    nextAlias: { type: String, trim: true, default: null },
    bookExternalId: { type: String, trim: true, default: '' },
    bookDisplayName: { type: String, trim: true, default: '' },
    approvedAliasesSnapshot: { type: [String], default: [] },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
)

BookAcronymPendingSuggestionSchema.index(
  { bookAcronym: 1, actionType: 1, currentAlias: 1, nextAlias: 1 },
  { unique: true }
)
BookAcronymPendingSuggestionSchema.index({ updatedAt: -1 })

export default mongoose.models.BookAcronymPendingSuggestion ||
  mongoose.model('BookAcronymPendingSuggestion', BookAcronymPendingSuggestionSchema)

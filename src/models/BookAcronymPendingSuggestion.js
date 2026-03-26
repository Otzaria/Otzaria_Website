import mongoose from 'mongoose'

const BookAcronymPendingSuggestionSchema = new mongoose.Schema(
  {
    bookAcronym: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookAcronym',
      required: true,
      index: true
    },
    alias: { type: String, required: true, trim: true },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
)

BookAcronymPendingSuggestionSchema.index({ bookAcronym: 1, alias: 1 }, { unique: true })
BookAcronymPendingSuggestionSchema.index({ updatedAt: -1 })

export default mongoose.models.BookAcronymPendingSuggestion ||
  mongoose.model('BookAcronymPendingSuggestion', BookAcronymPendingSuggestionSchema)

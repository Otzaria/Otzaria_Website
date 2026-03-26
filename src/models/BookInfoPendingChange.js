import mongoose from 'mongoose'
import {
  BOOK_INFO_GENERATION_OPTIONS,
  BOOK_INFO_SUB_GENERATION_OPTIONS
} from '@/lib/book-info-constants'

const PendingChangesSchema = new mongoose.Schema(
  {
    bookName: { type: String, trim: true },
    authorName: { type: String, trim: true },
    generationName: { type: String, enum: BOOK_INFO_GENERATION_OPTIONS },
    subGenerationName: { type: String, enum: BOOK_INFO_SUB_GENERATION_OPTIONS },
    startYear: { type: Number },
    endYear: { type: Number }
  },
  { _id: false }
)

const BookInfoPendingChangeSchema = new mongoose.Schema(
  {
    bookInfo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookInfo',
      required: true,
      unique: true,
      index: true
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    changes: {
      type: PendingChangesSchema,
      required: true
    }
  },
  { timestamps: true }
)

BookInfoPendingChangeSchema.index({ updatedAt: -1 })

export default mongoose.models.BookInfoPendingChange ||
  mongoose.model('BookInfoPendingChange', BookInfoPendingChangeSchema)

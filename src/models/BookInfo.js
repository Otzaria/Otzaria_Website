import mongoose from 'mongoose'
import {
  BOOK_INFO_GENERATION_OPTIONS,
  BOOK_INFO_SUB_GENERATION_OPTIONS
} from '@/lib/book-info-constants'

const BookInfoSchema = new mongoose.Schema(
  {
    bookName: { type: String, required: true, trim: true },
    authorName: { type: String, trim: true, default: '' },
    generationName: { type: String, enum: BOOK_INFO_GENERATION_OPTIONS, default: null },
    subGenerationName: { type: String, enum: BOOK_INFO_SUB_GENERATION_OPTIONS, default: null },
    startYear: { type: Number, default: null },
    endYear: { type: Number, default: null },
    createdFromCsv: { type: Boolean, default: false }
  },
  { timestamps: true }
)

BookInfoSchema.index({ bookName: 1, authorName: 1 }, { unique: true })
BookInfoSchema.index({ bookName: 'text', authorName: 'text' })

export default mongoose.models.BookInfo || mongoose.model('BookInfo', BookInfoSchema)

import mongoose from 'mongoose'

const BookAcronymSchema = new mongoose.Schema(
  {
    externalId: { type: String, required: true, unique: true, index: true, trim: true },
    displayName: { type: String, default: '', trim: true },
    bookPath: { type: String, default: '', trim: true },
    aliases: { type: [String], default: [] },
    createdFromJson: { type: Boolean, default: false }
  },
  { timestamps: true }
)

BookAcronymSchema.index({ displayName: 'text', aliases: 'text' })

export default mongoose.models.BookAcronym || mongoose.model('BookAcronym', BookAcronymSchema)

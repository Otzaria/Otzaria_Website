import mongoose from 'mongoose';

const BookSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, index: true, unique: true },
  totalPages: { type: Number, default: 0 },
  completedPages: { type: Number, default: 0 }, 
  category: { type: String },
  author: { type: String },
  description: { type: String },
  editingInfo: { type: Object },
  examplePage: { type: Number, default: null },
  folderPath: { type: String },
  isHidden: { type: Boolean, default: false },
  
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  originalOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isPrivate: { type: Boolean, default: false }
}, { timestamps: true });

BookSchema.index({ isHidden: 1 });
BookSchema.index({ category: 1 });
BookSchema.index({ name: 'text', description: 'text' });
BookSchema.index({ ownerId: 1 });

export default mongoose.models.Book || mongoose.model('Book', BookSchema);
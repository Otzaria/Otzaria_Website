import mongoose from 'mongoose';

// מודל לאחסון מטא-דטה של קבצים (GridFS)
const FileStorageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true }, // ID ב-GridFS
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.models.FileStorage || mongoose.model('FileStorage', FileStorageSchema);
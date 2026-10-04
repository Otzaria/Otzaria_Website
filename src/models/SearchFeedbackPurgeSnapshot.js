import mongoose from 'mongoose';

const SnapshotSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  previewId: { type: String, required: true, unique: true },
  filterHash: { type: String, required: true },
  asOf: { type: Date, required: true },
  count: { type: Number, default: 0 },
  chunks: { type: Number, default: 0 },
  phase: { type: String, enum: ['building', 'ready', 'deleting', 'done'], required: true },
  expiresAt: { type: Date, required: true },
});
SnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SnapshotSchema.index({ filterHash: 1, asOf: 1 });

const ChunkSchema = new mongoose.Schema({
  previewId: { type: String, required: true },
  chunk: { type: Number, required: true },
  eventIds: { type: [mongoose.Schema.Types.ObjectId], required: true },
  expiresAt: { type: Date, required: true },
});
ChunkSchema.index({ previewId: 1, chunk: 1 }, { unique: true });
ChunkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SearchFeedbackPurgeSnapshot = mongoose.models.SearchFeedbackPurgeSnapshot || mongoose.model('SearchFeedbackPurgeSnapshot', SnapshotSchema);
export const SearchFeedbackPurgeChunk = mongoose.models.SearchFeedbackPurgeChunk || mongoose.model('SearchFeedbackPurgeChunk', ChunkSchema);

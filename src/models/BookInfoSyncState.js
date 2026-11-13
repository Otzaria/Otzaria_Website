import mongoose from 'mongoose'

/** Shared cron lease and cache version; _id provides atomic lease ownership across workers. */
const schema = new mongoose.Schema({
  _id: { type: String, default: 'book-info' },
  owner: String,
  expiresAt: Date,
  identityRevision: Number,
  identityPrefixHash: String,
  nextMutationAt: Date,
  retryAt: Date,
  sourceHeadSha: String,
  sourceBlobSha: String,
  sourceIdentitySha: String,
}, { timestamps: true })
export default mongoose.models.BookInfoSyncState || mongoose.model('BookInfoSyncState', schema)

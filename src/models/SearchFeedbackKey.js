import mongoose from 'mongoose';

// זהות אנונימית של התקנה (מפתח ed25519) בערוץ משוב החיפוש. בלי IP ובלי פרטים מזהים.
const SearchFeedbackKeySchema = new mongoose.Schema({
  keyId: { type: String, required: true, unique: true },
  publicKey: { type: String, required: true },
  app: { type: String, enum: ['otzaria', 'zayit'], required: true },
  appVersionFirst: { type: String, maxlength: 64 },
  appVersionLast: { type: String, maxlength: 64 },
  platform: { type: String, enum: ['windows', 'linux', 'macos', 'android', 'ios'], required: true },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  eventCount: { type: Number, default: 0 },
  batchCount: { type: Number, default: 0 },
}, { timestamps: false });

SearchFeedbackKeySchema.index({ status: 1 });
SearchFeedbackKeySchema.index({ eventCount: -1 });

export default mongoose.models.SearchFeedbackKey || mongoose.model('SearchFeedbackKey', SearchFeedbackKeySchema);

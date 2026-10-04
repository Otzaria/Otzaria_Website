import mongoose from 'mongoose';

const EngineSchema = new mongoose.Schema({
  state: { type: String, default: null },
  modelFamilyId: { type: String, default: null },
  modelQuantization: { type: String, default: null },
  modelPackageChecksum: { type: String, default: null },
  embeddingDim: { type: Number, default: null },
  vectorsReleaseTag: { type: String, default: null },
  vectorsLibraryVersion: { type: Number, default: null },
  vectorSegments: { type: Number, default: null },
}, { _id: false });

const ContextSchema = new mongoose.Schema({
  app: { type: String, required: true },
  appVersion: { type: String, required: true },
  platform: { type: String, required: true },
  osVersion: { type: String, default: null },
  locale: { type: String, default: null },
  engine: { type: EngineSchema, default: null },
}, { _id: false });

// אירוע משוב מחיפוש סמנטי (נתוני אימון). payload כבר עבר ולידציה מלאה ב-lib/search-feedback.
const SearchFeedbackEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  keyId: { type: String, required: true },
  batchId: { type: String, required: true },
  type: { type: String, enum: ['search', 'results_shown', 'open', 'dwell', 'vote'], required: true },
  searchSessionId: { type: String, required: true },
  msSinceSearch: { type: Number, default: null },
  clientTime: { type: Date, required: true },
  sentAt: { type: Date, required: true },
  receivedAt: { type: Date, required: true },
  context: { type: ContextSchema, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
}, { minimize: false });

SearchFeedbackEventSchema.index({ type: 1 });
SearchFeedbackEventSchema.index({ searchSessionId: 1 });
SearchFeedbackEventSchema.index({ receivedAt: 1 });
SearchFeedbackEventSchema.index({ 'context.engine.modelFamilyId': 1 });
SearchFeedbackEventSchema.index({ 'context.engine.modelQuantization': 1 });
SearchFeedbackEventSchema.index({ keyId: 1 });

export default mongoose.models.SearchFeedbackEvent || mongoose.model('SearchFeedbackEvent', SearchFeedbackEventSchema);

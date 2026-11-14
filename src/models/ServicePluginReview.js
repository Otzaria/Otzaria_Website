import mongoose from 'mongoose'
import { STATUSES, OS_IDS, ARCH_IDS, NATIVE_KEYS, RECEIPT_STAGES } from '../lib/servicePlugins/policy.js'

const { ObjectId, Mixed } = mongoose.Schema.Types

// הגשה של תוסף שירות (src/lib/servicePlugins). כל כתיבה אחרי היצירה היא עדכון מותנה —
// אין doc.save() על הגשה שבודק עשוי להחזיק (lease + fence).
const AssetSchema = new mongoose.Schema({
  key: { type: String, enum: NATIVE_KEYS, required: true },
  name: { type: String, required: true, maxlength: 200 },
  size: { type: Number, required: true },
  os: { type: String, enum: OS_IDS, required: true },
  arch: { type: String, enum: ARCH_IDS, required: true },
  minOs: { type: String, default: '', maxlength: 100 },
  port: { type: Number, required: true },
  bundledPluginPath: { type: String, required: true, maxlength: 500 },
  releaseUrl: { type: String, required: true, maxlength: 2000 },
  sha256: { type: String, default: null },
  receivedAt: { type: Date, default: null },
}, { _id: false })

const ServicePluginReviewSchema = new mongoose.Schema({
  pluginId: { type: ObjectId, ref: 'Plugin', required: true, index: true },
  ownerId: { type: ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['service', 'plugin'], required: true },
  pluginVersion: { type: String, required: true, maxlength: 20 },
  serviceVersion: { type: String, default: null, maxlength: 20 },
  serviceRange: {
    min: { type: String, required: true, maxlength: 20 },
    max: { type: String, default: null, maxlength: 20 },
  },
  sources: [{ _id: false, repository: { type: String, required: true }, commit: { type: String, required: true } }],
  changeNotes: { type: String, default: '', maxlength: 2000 },
  uninstall: { type: String, default: null, maxlength: 2000 },
  virusTotalConsent: { type: Boolean, default: false },
  pluginAsset: {
    size: { type: Number, required: true },
    sha256: { type: String, default: null },
    receivedAt: { type: Date, default: null },
  },
  assets: { type: [AssetSchema], default: [] },
  manifest: { type: Mixed, default: null },
  manifestDigest: { type: String, default: null },
  policyVersion: { type: Number, required: true },

  status: { type: String, enum: STATUSES, default: 'draft', index: true },
  // = String(pluginId) כל עוד ההגשה פעילה; האינדקס הייחודי החלקי מונע שתי הגשות פעילות לתוסף.
  activeKey: { type: String, default: null },
  baseCurrentPluginReview: { type: ObjectId, default: null },
  selectedBy: { type: ObjectId, ref: 'User', default: null },
  selectedAt: { type: Date, default: null },
  exceptionUsed: {
    type: new mongoose.Schema({ reason: String, grantedBy: { type: ObjectId, ref: 'User' } }, { _id: false }),
    default: null,
  },
  attempts: { type: Number, default: 0 },
  unknownQuotaWaits: { type: Number, default: 0 },
  // נפרד מ-attempts: lease אחד יכול לפוג כדין (שער שבת), אך פקיעות חוזרות הן לולאת קריסה
  leaseExpiries: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: null },
  fence: { type: Number, default: 0 },
  lease: {
    owner: { type: String, default: null },
    tokenHash: { type: String, default: null },
    expiresAt: { type: Date, default: null },
  },
  receipts: [{ _id: false, stage: { type: String, enum: RECEIPT_STAGES }, digest: String, at: Date, data: Mixed }],
  decision: { type: Number, min: 0, max: 1, default: null },
  report: { type: String, default: null },
  decidedAt: { type: Date, default: null },
  publishedAt: { type: Date, default: null },
  filesDeletedAt: { type: Date, default: null },
  nativeFilesDeletedAt: { type: Date, default: null },
  lastError: {
    type: new mongoose.Schema({
      class: { type: String, enum: ['transient', 'quota', 'operator', 'validation'] },
      code: String,
      message: String,
      at: Date,
    }, { _id: false }),
    default: null,
  },
  cancelledBy: { type: ObjectId, ref: 'User', default: null },
  cancelReason: { type: String, default: null },
  cancelledAt: { type: Date, default: null },
  emailSentAt: { type: Date, default: null },
}, { timestamps: true })

ServicePluginReviewSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } })
ServicePluginReviewSchema.index({ status: 1, nextAttemptAt: 1 })
ServicePluginReviewSchema.index({ ownerId: 1, activeKey: 1 })
ServicePluginReviewSchema.index({ pluginId: 1, createdAt: -1 })

export default mongoose.models.ServicePluginReview || mongoose.model('ServicePluginReview', ServicePluginReviewSchema)

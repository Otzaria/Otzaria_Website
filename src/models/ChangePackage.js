import mongoose from 'mongoose';

// חבילת שינוי בלתי משתנה: כל שדה immutable, ו-changeDigest מחושב לפי OCJ-1 (§4.1).
const imm = (type, extra = {}) => ({ type, immutable: true, ...extra });
const ChangePackageSchema = new mongoose.Schema({
  changeId: imm(String, { required: true, unique: true }),
  report: imm(mongoose.Schema.Types.ObjectId, { ref: 'ErrorReport', required: true }),
  revision: imm(Number, { required: true }),
  generation: imm(Number, { required: true }),
  repo: imm(String, { required: true }),
  path: imm(String, { required: true }),
  baseCommitSha: imm(String, { required: true }),
  baseBlobSha: imm(String, { required: true }),
  lineIndex: imm(Number, { required: true }),
  originalLine: imm(String, { required: true }),
  newLine: imm(String, { required: true }),
  changeDigest: imm(String, { required: true }),
  createdBy: imm(String, { enum: ['service', 'volunteer'], required: true }),
  createdById: imm(mongoose.Schema.Types.ObjectId, { ref: 'User', default: null }),
  serviceChangeId: imm(String, { default: null }),
}, { timestamps: { createdAt: true, updatedAt: false } });

ChangePackageSchema.index({ report: 1, createdAt: -1 });

export default mongoose.models.ChangePackage || mongoose.model('ChangePackage', ChangePackageSchema);

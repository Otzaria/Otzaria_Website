import mongoose from 'mongoose';
// נתיב יחסי (לא '@/') — כדי שהמודל ייטען גם בבדיקות node:test
import { SCOPES, MAX_NAME, PREFIX_LEN } from '../lib/tzuratHadaf/tokenRules.js';

// צורת הדף — מפתח-גישה של מנהל המודול לכלי של צורת הדף (lib/tzuratHadaf/tokenRules.js). כמו PageProofToken:
// נשמרים רק ה-SHA-256 (hash) ו-8 התווים הראשונים (prefix). ביטול (revokedAt) חל מיד.
const TzuratTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    hash: { type: String, required: true, unique: true, select: false },
    prefix: { type: String, required: true, maxlength: PREFIX_LEN },
    scopes: { type: [{ type: String, enum: SCOPES }], default: () => [...SCOPES] },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TzuratTokenSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.TzuratToken || mongoose.model('TzuratToken', TzuratTokenSchema);

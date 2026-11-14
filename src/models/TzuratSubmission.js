import mongoose from 'mongoose';

// צורת הדף — הגשת בדיקת עמוד. lineOps — כפי שנשלחו (אחרי normalizeLineOps); anchors — נגזרים מהם
// (lib/tzuratHadaf/lineOps.js deriveAnchors) מול מודל העמוד בזמן ההגשה; מנהל יכול לשלוח lineOps מתוקנים
// באישור (reviewerEdited). ייצוא: anchors/checks רק מהגשות שאושרו. עדכונים מותנים בלבד.
const TzuratSubmissionSchema = new mongoose.Schema(
  {
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'TzuratPage', required: true },
    slug: { type: String, required: true },
    dafKey: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    who: { type: String, default: '' },
    userName: { type: String, default: '' },
    round: { type: Number, default: 1 },
    buildId: { type: String, default: '' },
    checks: { type: mongoose.Schema.Types.Mixed, default: {} },
    lineOps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    anchors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    itemAnswers: {
      type: [new mongoose.Schema({ item: mongoose.Schema.Types.ObjectId, verdict: String, text: String }, { _id: false })],
      default: [],
    },
    manualItems: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    reports: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    note: { type: String, default: '' },
    status: { type: String, enum: ['processing', 'submitted', 'approved', 'rejected'], default: 'submitted' },
    // Durable input and a renewable worker lease allow retry on standalone MongoDB.
    input: { type: mongoose.Schema.Types.Mixed, default: null },
    answerIssues: { type: [String], default: [] },
    processingToken: { type: String, default: null },
    processingUntil: { type: Date, default: null },
    reservationClaimed: { type: Boolean, default: false },
    reviewAction: { type: String, enum: ['approve', 'reject', null], default: null },
    reviewData: { type: mongoose.Schema.Types.Mixed, default: null },
    pointsAwarded: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
    reviewerEdited: { type: Boolean, default: false },
    exportedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

TzuratSubmissionSchema.index({ status: 1, createdAt: 1 });
TzuratSubmissionSchema.index({ page: 1, round: 1 });
TzuratSubmissionSchema.index({ user: 1, createdAt: -1 });
TzuratSubmissionSchema.index({ updatedAt: 1, _id: 1 });
TzuratSubmissionSchema.index(
  { page: 1, user: 1, round: 1 },
  { unique: true, partialFilterExpression: { status: 'processing' } }
);

export default mongoose.models.TzuratSubmission || mongoose.model('TzuratSubmission', TzuratSubmissionSchema);

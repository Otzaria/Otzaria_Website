import mongoose from 'mongoose'

// מסמך יחיד (key:'global'): נעילת ריצה אחת לכל הבודקים, והשהיה משותפת של תור Claude כשהמכסה מוצתה.
const ServiceScanControlSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  lock: {
    type: new mongoose.Schema({
      reviewId: { type: mongoose.Schema.Types.ObjectId, default: null },
      owner: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    }, { _id: false }),
    default: null,
  },
  quotaPausedUntil: { type: Date, default: null },
  quotaReason: { type: String, default: null },
}, { timestamps: true })

export default mongoose.models.ServiceScanControl || mongoose.model('ServiceScanControl', ServiceScanControlSchema)

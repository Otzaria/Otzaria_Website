import mongoose from 'mongoose';

const DictaBookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: "" },
  // סטטוס הספר - דומה למודל Page
  status: { 
    type: String, 
    enum: ['available', 'in-progress', 'completed'], 
    default: 'available' 
  },
  // העורך הנוכחי (מי שתפס את הספר)
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  claimedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  // היסטוריית גירסאות
  history: [{
    timestamp: { type: Date, default: Date.now },
    description: String,
    editorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    editorName: String,
  }]
}, { timestamps: true });

export default mongoose.models.DictaBook || mongoose.model('DictaBook', DictaBookSchema);

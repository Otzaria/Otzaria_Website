import mongoose from 'mongoose';

const PluginReportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true }, // מזהה ייחודי מהאפליקציה (idempotency)
  pluginUid: { type: String, index: true }, // מזהה התוסף מה-manifest
  pluginId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plugin', default: null, index: true },
  pluginName: { type: String }, // שם התוסף כפי שהותקן אצל המדווח
  pluginVersion: { type: String },
  developerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  reporterEmail: { type: String, default: null }, // כתובת אופציונלית למענה
  reportType: {
    type: String,
    enum: ['bug', 'crash', 'content', 'other'],
    default: 'other'
  },
  details: { type: String, required: true, maxlength: 5000 },
  appVersion: { type: String, maxlength: 30 },
  platform: { type: String, maxlength: 30 },
  contentHash: { type: String, index: true }, // טביעת אצבע לזיהוי דיווחים כפולים
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'rejected'],
    default: 'pending'
  },
  notifiedAt: { type: Date },
  messageSent: { type: Boolean, default: false },
  emailSent: { type: Boolean, default: false },
  adminNotes: { type: String },
}, { timestamps: true });

// שליפת הדיווחים של מפתח מסוים לפי סדר כרונולוגי הפוך
PluginReportSchema.index({ developerId: 1, createdAt: -1 });

export default mongoose.models.PluginReport || mongoose.model('PluginReport', PluginReportSchema);

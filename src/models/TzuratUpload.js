import mongoose from 'mongoose';
// נתיב יחסי (לא '@/') — כדי שהמודל ייטען גם בבדיקות node:test
import { STATUSES } from '../lib/tzuratHadaf/uploadRules.js';

// צורת הדף — העלאה מחולקת של חבילת מסכת + עבודת הייבוא שלה (lib/tzuratHadaf/uploads.js, importPackage.js).
// received — החלקים שהתקבלו ($addToSet); progress/heartbeatAt — מתעדכנים בזמן העיבוד ברקע; errorList — עד 20.
// הקבצים עצמם: storage/tzurat-hadaf/uploads/<id>/. עדכונים מותנים בלבד.
const TzuratUploadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    size: { type: Number, required: true },
    chunkSize: { type: Number, required: true },
    chunks: { type: Number, required: true },
    received: { type: [Number], default: [] },
    sha256: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'uploading' },
    progress: {
      type: new mongoose.Schema({ pages: Number, items: Number, images: Number }, { _id: false }),
      default: () => ({ pages: 0, items: 0, images: 0 }),
    },
    summary: { type: mongoose.Schema.Types.Mixed, default: null },
    // 'errors' שמור במונגוס — לכן errorList במסד, errors בתגובה (shapes.uploadShape)
    errorList: { type: [String], default: [] },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    heartbeatAt: { type: Date, default: null },
    // מזהה הריצה הנוכחית של עבודת הייבוא — דופק וסטטוס מותנים בו (ריצה שנתפסה מחדש נעצרת)
    runToken: { type: String, default: '' },
  },
  { timestamps: true }
);

TzuratUploadSchema.index({ createdAt: -1 });

export default mongoose.models.TzuratUpload || mongoose.model('TzuratUpload', TzuratUploadSchema);

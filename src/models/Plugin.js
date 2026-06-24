import mongoose from 'mongoose'

const PluginSchema = new mongoose.Schema(
  {
    // מידע בסיסי
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 120,
      // נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע נסיגה קטסטרופלית
      // eslint-disable-next-line security/detect-unsafe-regex
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },
    shortDescription: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, maxlength: 10000 },

    // מזהה ייחודי קבוע מתוך manifest.json (reverse-domain, למשל com.company.plugin-name).
    // קבוע לאורך חיי התוסף — לא ניתן לשנותו בעדכון, לא ע"י היוצר ולא ע"י מנהל.
    pluginUid: { type: String, trim: true, maxlength: 200, default: null },

    // גרסה וסטטוס
    version: { type: String, required: true, maxlength: 30 },
    status: {
      type: String,
      enum: ['stable', 'beta', 'experimental'],
      default: 'stable',
      required: true
    },

    // מפתח ותאימות
    author: { type: String, required: true, trim: true, maxlength: 100 },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    compatibleWith: { type: String, required: true, maxlength: 100 },
    // גרסת אוצריא המקסימלית הנתמכת (מ-maxAppVersion ב-manifest). null = ללא תקרה.
    maxAppVersion: { type: String, default: null, maxlength: 30 },

    // האם התוסף דורש חיבור אינטרנט (נקרא מ-network.enabled ב-manifest.json)
    requiresNetwork: { type: Boolean, default: false },

    // תגיות
    tags: [{ type: String, trim: true }],

    // קבצים - מאוחסנים במערכת הקבצים תחת storage/plugins/<id>/
    // כאן נשמרת רק מטא-דאטה.
    pluginFileName: { type: String, required: true }, // שם קובץ מקורי שהועלה (לשימוש ב-Content-Disposition)
    pluginFileExt: { type: String, required: true },  // הסיומת בפועל בדיסק (כולל נקודה), למשל ".otzplugin"
    pluginFileSize: { type: Number, default: 0 },

    image: {
      ext: { type: String, default: null },          // סיומת כולל נקודה, למשל ".png"
      contentType: { type: String, default: null }
    },

    screenshots: [{
      ext: { type: String, required: true },
      contentType: { type: String, required: true }
    }],

    // קישורים חיצוניים
    homepage: { type: String, trim: true },

    // תאריך מקורי (מה-JSON)
    originalDate: { type: String }, // YYYY-MM-DD format

    // אישור מנהל
    isApproved: { type: Boolean, default: false, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },

    // מידע על ההגשה האחרונה ועדכונים ממתינים
    submissionType: {
      type: String,
      enum: ['new', 'update'],
      default: 'new'
    },
    lastSubmittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastSubmittedAt: { type: Date },
    pendingChangeSummary: [{
      field: { type: String },
      label: { type: String },
      before: { type: String },
      after: { type: String }
    }],
    pendingUpdate: { type: mongoose.Schema.Types.Mixed, default: null },

    // סטטיסטיקות
    downloadCount: { type: Number, default: 0 },

    // הסתרה (במקום מחיקה)
    isHidden: { type: Boolean, default: false, index: true },

    // הצמדה (תוספים מוצמדים יוצגו ראשונים)
    isPinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
)

// אינדקסים
PluginSchema.index({ name: 'text', shortDescription: 'text', description: 'text' })
PluginSchema.index({ tags: 1 })
PluginSchema.index({ isApproved: 1, isHidden: 1 })
PluginSchema.index({ createdAt: -1 })
// מזהה התוסף (pluginUid מתוך manifest.json) ייחודי בין תוספים שונים.
// אינדקס חלקי (string בלבד) כדי לאפשר תוספים ישנים שטרם נשמר עבורם המזהה (null).
PluginSchema.index(
  { pluginUid: 1 },
  { unique: true, partialFilterExpression: { pluginUid: { $type: 'string' } } }
)

// Virtual fields - URLs מצביעים לראוטים שמגישים מהדיסק
PluginSchema.virtual('imageUrl').get(function () {
  return this.image && this.image.ext ? `/api/plugins/${this._id}/image` : null
})

PluginSchema.virtual('pluginUrl').get(function () {
  return `/api/plugins/${this._id}/download`
})

PluginSchema.virtual('screenshotUrls').get(function () {
  return this.screenshots?.map((_, index) => `/api/plugins/${this._id}/screenshots/${index}`) || []
})

// Methods
PluginSchema.methods.approve = function (adminId) {
  this.isApproved = true
  this.approvedBy = adminId
  this.approvedAt = new Date()
  return this.save()
}

PluginSchema.methods.clearPendingUpdate = function () {
  this.pendingUpdate = null
  this.pendingChangeSummary = []
  this.submissionType = 'new'
  return this
}

PluginSchema.methods.incrementDownload = function () {
  this.downloadCount += 1
  return this.save()
}

// Static methods
PluginSchema.statics.getApprovedPlugins = function () {
  return this.find({ isApproved: true, isHidden: false })
    .sort({ createdAt: -1 })
    .populate('authorId', 'name email')
    .populate('approvedBy', 'name email')
    .select('-__v')
}

PluginSchema.statics.getPendingPlugins = function () {
  return this.find({ isApproved: false, isHidden: false })
    .sort({ createdAt: -1 })
    .populate('authorId', 'name email')
    .select('-__v')
}

export default mongoose.models.Plugin || mongoose.model('Plugin', PluginSchema)

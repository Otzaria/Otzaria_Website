import mongoose from 'mongoose'

const PluginSchema = new mongoose.Schema(
  {
    // מידע בסיסי
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    shortDescription: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    
    // גרסה וסטטוס
    version: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['stable', 'beta', 'experimental'], 
      default: 'stable' 
    },
    
    // מפתח ותאימות
    author: { type: String, required: true, trim: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    compatibleWith: { type: String, required: true },
    
    // תגיות
    tags: [{ type: String, trim: true }],
    
    // קבצים - מאוחסנים כ-Buffer במסד הנתונים
    imageData: { type: Buffer }, // נתוני התמונה
    imageContentType: { type: String }, // image/png, image/jpeg, etc.
    
    pluginData: { type: Buffer, required: true }, // נתוני קובץ התוסף
    pluginFileName: { type: String, required: true }, // שם הקובץ המקורי
    
    screenshots: [{
      data: { type: Buffer },
      contentType: { type: String }
    }],
    
    // קישורים חיצוניים
    homepage: { type: String, trim: true },
    
    // הוראות התקנה
    installInstructions: [{ type: String }],
    
    // תאריך מקורי (מה-JSON)
    originalDate: { type: String }, // YYYY-MM-DD format
    
    // אישור מנהל
    isApproved: { type: Boolean, default: false, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    
    // סטטיסטיקות
    downloadCount: { type: Number, default: 0 },
    
    // הסתרה (במקום מחיקה)
    isHidden: { type: Boolean, default: false, index: true },
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

// Virtual fields
PluginSchema.virtual('imageUrl').get(function() {
  return this.imageData ? `/api/plugins/${this._id}/image` : null
})

PluginSchema.virtual('pluginUrl').get(function() {
  return `/api/plugins/${this._id}/download`
})

PluginSchema.virtual('screenshotUrls').get(function() {
  return this.screenshots?.map((_, index) => `/api/plugins/${this._id}/screenshot/${index}`) || []
})

// Methods
PluginSchema.methods.approve = function(adminId) {
  this.isApproved = true
  this.approvedBy = adminId
  this.approvedAt = new Date()
  return this.save()
}

PluginSchema.methods.incrementDownload = function() {
  this.downloadCount += 1
  return this.save()
}

// Static methods
PluginSchema.statics.getApprovedPlugins = function() {
  return this.find({ isApproved: true, isHidden: false })
    .sort({ createdAt: -1 })
    .populate('authorId', 'name email')
    .populate('approvedBy', 'name email')
    .select('-pluginData -imageData -screenshots.data -__v') // לא מחזירים את הנתונים הבינאריים
}

PluginSchema.statics.getPendingPlugins = function() {
  return this.find({ isApproved: false, isHidden: false })
    .sort({ createdAt: -1 })
    .populate('authorId', 'name email')
    .select('-pluginData -imageData -screenshots.data -__v') // לא מחזירים את הנתונים הבינאריים
}

export default mongoose.models.Plugin || mongoose.model('Plugin', PluginSchema)

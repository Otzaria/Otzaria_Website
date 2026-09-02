import mongoose from 'mongoose'
import { DEFAULT_PRIOR_AVG } from '@/lib/pluginRating'

// מטא-דאטה של מתקין התוכנה הנלווית — הגדרה אחת, המשמשת גם את הגרסה החיה וגם
// את רשומות ההיסטוריה (versions[]). ראו הסבר מלא בשדה companion שלמטה.
const CompanionSchema = new mongoose.Schema(
  {
    present: { type: Boolean, default: false },
    name: { type: String, default: '', trim: true, maxlength: 60 },
    version: { type: String, default: '', trim: true, maxlength: 40 },
    platform: { type: String, enum: ['windows', 'linux', 'macos', null], default: null },
    fileName: { type: String, default: '' },   // שם הקובץ שהועלה, ל-Content-Disposition
    ext: { type: String, default: '' },        // הסיומת בפועל בדיסק, כולל נקודה
    size: { type: Number, default: 0 },
    sha256: { type: String, default: '' },     // מוצג בדף התוסף — הקובץ בר-אימות
    // המתקין מתקין בעצמו גם את קובץ התוסף (מתקין שמריץ את ה-.otzplugin בסופו).
    // אז דף התוסף מציג צעד אחד ולא שניים.
    installsPlugin: { type: Boolean, default: false }
  },
  { _id: false }
)

const PluginSchema = new mongoose.Schema(
  {
    // מידע בסיסי
    name: { type: String, required: true, trim: true, maxlength: 14 },
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

    // ===== תוכנה נלווית =====
    // תוסף שאינו יכול לעבוד לבדו: הוא מדבר עם תוכנה שרצה על המחשב מחוץ לאוצריא
    // (למשל מתאם שפותח סוקט רשת בשביל תוסף שרץ ב-WebView). המתקין מועלה כקובץ
    // נפרד מה-.otzplugin ונשמר תחת storage/plugins/<id>/companion<ext>; כאן
    // מטא-דאטה בלבד. present=false (ברירת המחדל) פירושו תוסף רגיל.
    // ראו src/lib/pluginCompanion.js.
    companion: { type: CompanionSchema, default: () => ({}) },

    screenshots: [{
      ext: { type: String, required: true },
      contentType: { type: String, required: true }
    }],

    // קישורים חיצוניים
    homepage: { type: String, trim: true },

    // תאריך מקורי (מה-JSON)
    originalDate: { type: String }, // YYYY-MM-DD format

    // מועד ההחלפה האחרונה של קובץ התוסף עצמו בדיסק (העלאה ראשונה / עדכון עם קובץ).
    // בשונה מ-updatedAt של Mongoose, לא מושפע מאישורים, עריכות מטא-דאטה וכד'.
    fileUpdatedAt: { type: Date, default: null },

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

    // פילוח הורדות לפי גרסה — לשימוש פנימי בלבד, לא נחשף ב-API ולא בתצוגה.
    // מפתח כמערך (ולא כאובייקט/Map) כי מספרי גרסה מכילים נקודות.
    downloadsByVersion: [{
      _id: false,
      version: { type: String, required: true, maxlength: 40 },
      count: { type: Number, default: 0 }
    }],

    // ===== דירוגים =====
    // האגרגט מנורמל כאן כדי שהחנות תוכל למיין ולהציג בלי join. מקור האמת הוא
    // אוסף PluginRating, וכל השדות האלה מחושבים ממנו מחדש בכל שינוי דירוג
    // (src/lib/pluginRatingStore.js — recomputePluginRating).
    ratingCount: { type: Number, default: 0 },          // מספר המדרגים (גלויים)
    ratingSum: { type: Number, default: 0 },            // סכום הדירוגים, לממוצע המוצג
    ratingAvg: { type: Number, default: 0 },            // הממוצע האמיתי — זה שמוצג
    ratingVerifiedCount: { type: Number, default: 0 },  // מתוכם בעלי התקנה מאומתת
    // התפלגות 1★..5★ (אינדקס 0 = כוכב אחד) — להיסטוגרמה בדף התוסף
    ratingBreakdown: { type: [Number], default: () => [0, 0, 0, 0, 0] },
    // הסכום והמשקל המשוקללים (דירוג מאומת שוקל יותר) — קלט לציון המיון
    ratingWeightedSum: { type: Number, default: 0 },
    ratingWeight: { type: Number, default: 0 },
    // הציון שלפיו ממוינת החנות: ממוצע מוחלק (Bayesian) ולא הממוצע הגולמי, כדי
    // שדירוג בודד לא יעקוף עשרות דירוגים. פנימי — אינו נחשף ב-API.
    // ברירת המחדל היא העוגן הגלובלי, כך שתוסף ללא דירוגים יושב באמצע ולא בתחתית.
    ratingScore: { type: Number, default: DEFAULT_PRIOR_AVG, index: true },

    // הסתרה (במקום מחיקה)
    isHidden: { type: Boolean, default: false, index: true },

    // השהיה מהחנות — נפרד מהאישור ומההסתרה. תוסף מושהה אינו מופיע בחנות
    // ואינו ניתן להורדה, אך נגיש בקישור ישיר למעלה התוסף ולמנהלי התוספים.
    // suspendedByRole קובע מי רשאי להחזיר: השהיית מנהל ('admin') גוברת על
    // המעלה, ורק מנהל יכול לבטלה. ראו src/lib/pluginVisibility.js.
    isSuspended: { type: Boolean, default: false, index: true },
    suspendedAt: { type: Date, default: null },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    suspendedByRole: { type: String, enum: ['owner', 'admin', null], default: null },

    // הערה: מנגנון ההצמדה (isPinned/pinnedAt) בוטל ב-31/07/2026 והוחלף
    // ב"תוספים נבחרים" (StoreSettings.featuredPluginIds) — הנבחרים ממוינים
    // ראשונים ב-GET /api/plugins ומסומנים בו isPinned:true לתאימות לאחור.

    // היסטוריית גרסאות קודמות. נדחפת אליה הגרסה היוצאת כשמעלים גרסה חדשה
    // (עליית גרסה ממש). עריכה ללא העלאת גרסה דורסת את הגרסה הנוכחית ולא נשמרת כאן.
    // הקובץ עצמו של כל גרסה ישנה נשמר תחת storage/plugins/<id>/versions/<version>/.
    // כאן נשמרת רק מטא-דאטה (לפי החלטת אפיון — לא משכפלים תמונות/צילומי מסך).
    versions: [{
      _id: false,
      version: { type: String, required: true, maxlength: 40 },
      pluginFileName: { type: String, default: '' },
      pluginFileExt: { type: String, default: '.otzplugin' },
      pluginFileSize: { type: Number, default: 0 },
      status: { type: String, enum: ['stable', 'beta', 'experimental'], default: 'stable' },
      compatibleWith: { type: String, default: '' },
      maxAppVersion: { type: String, default: null },
      requiresNetwork: { type: Boolean, default: false },
      shortDescription: { type: String, default: '' },
      description: { type: String, default: '' },
      // המתקין של אותה גרסה נשמר לצידה תחת versions/<version>/companion<ext>,
      // כדי שגרסה ארכיונית תוגש עם התוכנה שהתאימה לה ולא עם החדשה.
      companion: { type: CompanionSchema, default: () => ({}) },
      archivedAt: { type: Date, default: Date.now }
    }],
  },
  {
    timestamps: true,
    // downloadsByVersion פנימי בלבד — מוסר מכל סריאליזציה כדי שלא ידלוף בתשובות API.
    // (שאילתות .lean() עוקפות את ה-transform ומטופלות ב-select בראוטים עצמם.)
    toJSON: { virtuals: true, transform: stripInternalFields },
    toObject: { virtuals: true, transform: stripInternalFields }
  }
)

function stripInternalFields(doc, ret) {
  delete ret.downloadsByVersion
  return ret
}

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

PluginSchema.virtual('companionUrl').get(function () {
  return this.companion?.present ? `/api/plugins/${this._id}/companion` : null
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

// העלאת מונה ההורדות הכללי + המונה של הגרסה שהורדה בפועל (ברירת מחדל: הגרסה החיה).
// עדכונים אטומיים ($inc) כדי שלא לאבד ספירות בהורדות מקבילות.
PluginSchema.methods.incrementDownload = async function (version) {
  const ver = version || this.version
  const Plugin = this.constructor

  const res = await Plugin.updateOne(
    { _id: this._id, 'downloadsByVersion.version': ver },
    { $inc: { downloadCount: 1, 'downloadsByVersion.$.count': 1 } }
  )
  if (res.matchedCount > 0) return

  // אין עדיין רשומה לגרסה — יצירתה, עם תנאי $ne שמונע כפילות במרוץ בין בקשות
  const pushRes = await Plugin.updateOne(
    { _id: this._id, 'downloadsByVersion.version': { $ne: ver } },
    { $inc: { downloadCount: 1 }, $push: { downloadsByVersion: { version: ver, count: 1 } } }
  )
  if (pushRes.matchedCount === 0) {
    // בקשה מקבילה הספיקה ליצור את הרשומה — מעדכנים אותה
    await Plugin.updateOne(
      { _id: this._id, 'downloadsByVersion.version': ver },
      { $inc: { downloadCount: 1, 'downloadsByVersion.$.count': 1 } }
    )
  }
}

// Static methods
PluginSchema.statics.getApprovedPlugins = function () {
  return this.find({ isApproved: true, isHidden: false, isSuspended: { $ne: true } })
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

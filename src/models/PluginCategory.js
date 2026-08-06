import mongoose from 'mongoose'

// קטגוריה מנוהלת בחנות התוספים. השיבוץ יושב כאן (pluginIds מסודר) ולא על התוסף —
// סדר המערך הוא סדר התצוגה בדף הקטגוריה ובשורת דף-הבית.
// ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md פרק 5.
const PluginCategorySchema = new mongoose.Schema(
  {
    // שם תצוגה בעברית, ייחודי
    name: { type: String, required: true, trim: true, maxlength: 40, unique: true },

    // slug לטיני ל-URL: /plugins/category/<slug>. שינוי slug שובר קישורים קיימים.
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 60,
      // נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע נסיגה קטסטרופלית
      // eslint-disable-next-line security/detect-unsafe-regex
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },

    // תיאור קצר המוצג בראש דף הקטגוריה ובכרטיס הקטגוריה
    description: { type: String, trim: true, maxlength: 300, default: '' },

    // שם אייקון Material Symbols, למשל 'extension'
    icon: { type: String, trim: true, maxlength: 60, default: '' },

    // סדר הקטגוריה ברשימות (קטן = ראשון)
    order: { type: Number, default: 0, index: true },

    // האם מופיעה כשורת תוספים בדף הבית של החנות
    showOnHome: { type: Boolean, default: false },

    // כמה תוספים מוצגים בשורת דף-הבית לפני "לכל הקטגוריה"
    homeLimit: { type: Number, default: 6, min: 3, max: 12 },

    // הסתרת הקטגוריה כולה (בזמן בנייה וכד') בלי למחוק
    isVisible: { type: Boolean, default: true },

    // התוספים המשובצים, בסדר תצוגה ידני. מותר לשבץ גם תוסף שטרם אושר —
    // הוא פשוט מסונן מכל תצוגה ציבורית עד אישורו.
    pluginIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plugin' }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

// שליפה הפוכה "לאילו קטגוריות שייך תוסף X" — אינדקס multikey
PluginCategorySchema.index({ pluginIds: 1 })
PluginCategorySchema.index({ isVisible: 1, order: 1 })

export default mongoose.models.PluginCategory || mongoose.model('PluginCategory', PluginCategorySchema)

import mongoose from 'mongoose'

// דירוג תוסף בחנות — מסמך אחד לכל צמד (תוסף, משתמש).
// הדירוג נעשה באתר בלבד, למשתמש מחובר, ולא על תוסף של המדרג עצמו.
// האגרגטים (ממוצע, מונים, ציון המיון) יושבים מנורמלים על מסמך התוסף
// ומחושבים מחדש בכל שינוי — ראו src/lib/pluginRatingStore.js.
const PluginRatingSchema = new mongoose.Schema(
  {
    pluginId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plugin', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    value: { type: Number, required: true, min: 1, max: 5 },

    // "דירוג מאומת" — למדרג היה רישום התקנה בפועל של התוסף (PluginInstall)
    // בעת הדירוג. שוקל יותר בציון המיון, ומסומן בתצוגה.
    verifiedInstall: { type: Boolean, default: false },
    // הגרסה שהותקנה בפועל בעת האימות (אבחון בלבד)
    verifiedVersion: { type: String, default: null, maxlength: 40 },

    // הגרסה שהוצגה בדף בעת הדירוג — לאבחון "דירוגים לגרסה בעייתית"
    pluginVersion: { type: String, default: null, maxlength: 40 },

    // הסתרה בידי מנהל תוספים (במקום מחיקה, כמו בשאר המערכת). דירוג מוסתר
    // אינו נספר באגרגט ואינו משפיע על הממוצע ועל הציון.
    isHidden: { type: Boolean, default: false },
    hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    hiddenAt: { type: Date, default: null }
  },
  { timestamps: true }
)

// דירוג אחד לכל משתמש בכל תוסף (עדכון דורס, לא מוסיף)
PluginRatingSchema.index({ pluginId: 1, userId: 1 }, { unique: true })
// שליפת הדירוגים הגלויים של תוסף לחישוב האגרגט ולמודרציה
PluginRatingSchema.index({ pluginId: 1, isHidden: 1, createdAt: -1 })

export default mongoose.models.PluginRating || mongoose.model('PluginRating', PluginRatingSchema)

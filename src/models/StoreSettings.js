import mongoose from 'mongoose'

// מסמך יחיד (singleton, key='store') המחזיק את האצירה של דף הבית של חנות התוספים
// שאינה "קטגוריה": רשימת התוספים הנבחרים וטקסטים ניתנים לעריכה.
// גישה תמיד דרך getStoreSettings() — יצירה עצלה, אין צורך בסיד.
const StoreSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'store', immutable: true },

    // "תוספים נבחרים" בדף הבית, בסדר תצוגה ידני. מומלץ עד 8 (אזהרה רכה ב-UI).
    featuredPluginIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plugin' }],

    // טקסטים של דף הבית; ריק = ברירות המחדל שבקוד האתר
    homeTitle: { type: String, trim: true, maxlength: 80, default: '' },
    homeSubtitle: { type: String, trim: true, maxlength: 200, default: '' },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

const StoreSettings = mongoose.models.StoreSettings || mongoose.model('StoreSettings', StoreSettingsSchema)

export async function getStoreSettings() {
  return StoreSettings.findOneAndUpdate(
    { key: 'store' },
    { $setOnInsert: { featuredPluginIds: [], homeTitle: '', homeSubtitle: '' } },
    { upsert: true, new: true }
  )
}

export default StoreSettings

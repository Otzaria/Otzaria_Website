import mongoose from 'mongoose'

// רישום התקנה ישירה מוצלחת של מי שלא היה מחובר, לפי מזהה הדפדפן האנונימי
// (עוגיית otz_install_id שנקבעת בעת יצירת טוקן ההתקנה).
//
// למה זה קיים: התקנה אנונימית לא ניתנת לשיוך לחשבון בזמן אמת, אבל תרחיש
// "התקין ורק אחר-כך נרשם ובא לדרג" הוא מצוי. השורות כאן ממתינות ל"תביעה":
// כשמשתמש מחובר מדרג מאותו דפדפן (claimAnonInstalls), ההתקנות שלו עוברות
// ל-PluginInstall על שמו והדירוג מסומן מאומת.
//
// מגבלות מתועדות: הזיהוי הוא לפי דפדפן — ניקוי עוגיות או מעבר מכשיר מאבד את
// הקישור, ולכן היעדר שורה כאן אינו מעיד דבר (בדיוק כמו התקנה ידנית של קובץ).
// TTL של 400 יום (כאורך חיי העוגיה, שהוא גם התקרה שהדפדפנים אוכפים) מונע
// הצטברות של שורות שלעולם לא ייתבעו.
const PluginAnonInstallSchema = new mongoose.Schema(
  {
    anonId: { type: String, required: true, index: true, maxlength: 64 },
    pluginId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plugin', required: true, index: true },

    // הגרסה האחרונה שהותקנה/עודכנה בהצלחה
    version: { type: String, default: '', maxlength: 40 },
    // גרסת אוצריא שדיווחה (אבחון)
    appVersion: { type: String, default: null, maxlength: 30 },

    firstInstalledAt: { type: Date, default: Date.now },
    lastInstalledAt: { type: Date, default: Date.now },
    installCount: { type: Number, default: 1 }
  },
  { timestamps: true }
)

PluginAnonInstallSchema.index({ anonId: 1, pluginId: 1 }, { unique: true })
// 400 יום מההתקנה האחרונה — תואם לאורך חיי העוגיה
PluginAnonInstallSchema.index({ lastInstalledAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 })

export default mongoose.models.PluginAnonInstall ||
  mongoose.model('PluginAnonInstall', PluginAnonInstallSchema)

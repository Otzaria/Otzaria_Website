import mongoose from 'mongoose'

// רישום התקנה מאומתת של תוסף בידי משתמש מזוהה.
//
// למה זה קיים: טוקן ההתקנה הישירה (PluginInstallToken) הוא זמני ונמחק ב-TTL,
// ולכן אינו יכול לשמש כהוכחת התקנה בהמשך. כשמשתמש מחובר מתקין תוסף מהאתר
// והאפליקציה מדווחת הצלחה — נרשמת כאן שורה קבועה, וממנה נגזר "דירוג מאומת".
//
// התקנה ישירה של מי שלא היה מחובר נרשמת ב-PluginAnonInstall (לפי עוגיית
// דפדפן) ועוברת לכאן בתביעה לחשבון בעת דירוג (claimAnonInstalls).
//
// מגבלה מתועדת: מכסה התקנה ישירה מהאתר בלבד. התקנה ידנית של קובץ שהורד אינה
// מזוהה, ולכן היעדר רישום אינו מעיד שהתוסף לא הותקן — ולכן הוא גם אינו חוסם
// דירוג, אלא רק אינו מקנה לו את סימון האימות.
const PluginInstallSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pluginId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plugin', required: true, index: true },

    // הגרסה האחרונה שהותקנה/עודכנה בהצלחה
    version: { type: String, default: '', maxlength: 40 },
    // גרסת אוצריא שדיווחה (אבחון)
    appVersion: { type: String, default: null, maxlength: 30 },

    firstInstalledAt: { type: Date, default: Date.now },
    lastInstalledAt: { type: Date, default: Date.now },
    // כמה דיווחי התקנה/עדכון מוצלחים נרשמו
    installCount: { type: Number, default: 1 }
  },
  { timestamps: true }
)

PluginInstallSchema.index({ userId: 1, pluginId: 1 }, { unique: true })

export default mongoose.models.PluginInstall || mongoose.model('PluginInstall', PluginInstallSchema)

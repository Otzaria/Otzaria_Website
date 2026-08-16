import mongoose from 'mongoose'

// טוקן חד-פעמי למעקב אחר התקנה ישירה של תוסף (otzaria://plugin/install).
// האתר יוצר טוקן לפני הניווט לפרוטוקול, האפליקציה מדווחת עליו הצלחה/כישלון,
// ודף החנות עושה polling כדי להציג למשתמש את התוצאה.
// הפרמטר אופציונלי לחלוטין — גרסאות אפליקציה שאינן מכירות אותו מתעלמות ממנו.
const PluginInstallTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    pluginId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plugin', required: true, index: true },
    version: { type: String, default: '', maxlength: 40 },

    status: {
      type: String,
      enum: ['pending', 'success', 'failure'],
      default: 'pending',
      required: true
    },
    // הודעת שגיאה שהאפליקציה שלחה בכישלון (מוצגת למשתמש בדף)
    errorMessage: { type: String, default: null, maxlength: 500 },
    // גרסת אוצריא שדיווחה (אופציונלי, לצורכי אבחון)
    appVersion: { type: String, default: null, maxlength: 30 },
    // האם התוסף כבר היה מותקן ורק עודכן. גרסאות אוצריא שאינן שולחות את
    // השדה משאירות false, והדף מציג את נוסח ההתקנה כמו עד היום.
    wasUpdate: { type: Boolean, default: false },
    reportedAt: { type: Date, default: null },

    // מתי הגיעה בקשת הורדת הקובץ מהאפליקציה (הטוקן מצורף ל-URL ההורדה).
    // משמש את הדף לזיהוי מוקדם של "אוצריא כנראה לא מותקנת" — אם תוך פרק
    // זמן סביר לא הגיעה בקשת הורדה, האפליקציה כנראה לא נפתחה כלל.
    downloadedAt: { type: Date, default: null },

    // מתי האפליקציה אישרה קבלת בקשת ההתקנה (status='received' — נשלח מיד
    // עם קבלת הקישור, לפני ההורדה ודיאלוג ההרשאות). האות המהיר ביותר לכך
    // שאוצריא חיה; גרסאות ישנות אינן שולחות אותו — ואז ההורדה היא האות.
    receivedAt: { type: Date, default: null },

    // תפוגה — מסמך נמחק אוטומטית ע"י TTL של מונגו אחרי המועד הזה.
    // (הניקוי של מונגו רץ כדקה אחת אחורה, לכן הראוטים בודקים גם את הערך עצמו.)
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
)

PluginInstallTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.models.PluginInstallToken ||
  mongoose.model('PluginInstallToken', PluginInstallTokenSchema)

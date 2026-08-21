import Plugin from '@/models/Plugin'
import PluginRating from '@/models/PluginRating'
import PluginInstall from '@/models/PluginInstall'
import PluginAnonInstall from '@/models/PluginAnonInstall'
import StoreSettings, { getStoreSettings } from '@/models/StoreSettings'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import {
  aggregateRatings,
  normalizePriorAvg,
  DEFAULT_PRIOR_AVG,
  MIN_PRIOR_SAMPLE
} from '@/lib/pluginRating'

// גישת ה-DB של הדירוגים. החישוב עצמו טהור ויושב ב-src/lib/pluginRating.js.

// כמה זמן הממוצע הגלובלי (עוגן ההחלקה) נחשב טרי. הוא זז לאט מאוד, ואין טעם
// לחשב אותו בכל דירוג.
const PRIOR_TTL_MS = 24 * 60 * 60 * 1000

// הממוצע הגלובלי של דירוגי החנות, במטמון ב-StoreSettings.
// עד שיצטברו MIN_PRIOR_SAMPLE דירוגים — עוגן קבוע, כי ממוצע של מדגם זעיר הוא רעש.
export async function getRatingPriorAvg() {
  const settings = await getStoreSettings()
  const updatedAt = settings.ratingPriorUpdatedAt
  const isFresh = updatedAt instanceof Date && Date.now() - updatedAt.getTime() < PRIOR_TTL_MS
  if (isFresh && typeof settings.ratingPriorAvg === 'number') {
    return normalizePriorAvg(settings.ratingPriorAvg)
  }

  const [row] = await PluginRating.aggregate([
    { $match: { isHidden: { $ne: true } } },
    { $group: { _id: null, avg: { $avg: '$value' }, count: { $sum: 1 } } }
  ])

  const prior = row && row.count >= MIN_PRIOR_SAMPLE
    ? normalizePriorAvg(row.avg)
    : DEFAULT_PRIOR_AVG

  await StoreSettings.updateOne(
    { key: 'store' },
    { $set: { ratingPriorAvg: prior, ratingPriorUpdatedAt: new Date() } }
  )
  return prior
}

// חישוב מחדש של האגרגט של תוסף מתוך הדירוגים הגלויים שלו.
//
// מדוע חישוב מלא ולא $inc דלתאי (כמו במונה ההורדות): נפח הדירוגים לתוסף קטן
// בסדרי גודל מנפח ההורדות, ותשעה שדות מקושרים (סכום, משקל, התפלגות, ממוצע,
// ציון) שנשמרים בדלתאות סופגים סחיפה בכל תקלה. חישוב מלא הוא אידמפוטנטי:
// גם אם שתי בקשות מקבילות דורסות זו את זו — התוצאה נכונה.
export async function recomputePluginRating(pluginId) {
  const [ratings, priorAvg] = await Promise.all([
    PluginRating.find({ pluginId, isHidden: { $ne: true } }).select('value verifiedInstall').lean(),
    getRatingPriorAvg()
  ])

  const aggregate = aggregateRatings(ratings, { priorAvg })
  await Plugin.updateOne({ _id: pluginId }, { $set: aggregate })
  // אינדקס החיפוש מחזיק עותק של מסמכי התוספים (כולל שדות הדירוג) — להפיג
  invalidatePluginSearchIndex()
  return aggregate
}

// האם למשתמש יש רישום התקנה מאומתת של התוסף (מקנה "דירוג מאומת")
export async function findVerifiedInstall(userId, pluginId) {
  if (!userId || !pluginId) return null
  return PluginInstall.findOne({ userId, pluginId }).select('version').lean()
}

// רישום התקנה מוצלחת של משתמש מזוהה. אידמפוטנטי-בטוח: upsert עם $inc.
// מחזיר true אם זו הפעם הראשונה שנרשמה התקנה לצמד הזה.
export async function recordVerifiedInstall({ userId, pluginId, version, appVersion }) {
  const now = new Date()
  const result = await PluginInstall.updateOne(
    { userId, pluginId },
    {
      $set: { lastInstalledAt: now, version: version || '', appVersion: appVersion || null },
      $inc: { installCount: 1 },
      $setOnInsert: { firstInstalledAt: now }
    },
    { upsert: true }
  )
  return result.upsertedCount > 0
}

// רישום התקנה מוצלחת של מי שלא היה מחובר, לפי מזהה הדפדפן האנונימי.
// ממתין לתביעה לחשבון (claimAnonInstalls) בעת דירוג. אידמפוטנטי כמו המזוהה.
export async function recordAnonInstall({ anonId, pluginId, version, appVersion }) {
  const now = new Date()
  await PluginAnonInstall.updateOne(
    { anonId, pluginId },
    {
      $set: { lastInstalledAt: now, version: version || '', appVersion: appVersion || null },
      $inc: { installCount: 1 },
      $setOnInsert: { firstInstalledAt: now }
    },
    { upsert: true }
  )
}

// תביעת ההתקנות האנונימיות של הדפדפן הזה לחשבון: מי שהתקין לפני שנרשם/התחבר
// מקבל רישום PluginInstall על שמו — וממנו "דירוג מאומת". נקרא מראוט הדירוג
// (הרגע שבו האימות מתחיל להיות רלוונטי); רץ פעם אחת בפועל, כי השורות נמחקות.
// מחזיר את מספר ההתקנות שנתבעו.
export async function claimAnonInstalls({ userId, anonId }) {
  if (!userId || !anonId) return 0
  const anonRows = await PluginAnonInstall.find({ anonId }).lean()
  if (anonRows.length === 0) return 0

  for (const row of anonRows) {
    await PluginInstall.updateOne(
      { userId, pluginId: row.pluginId },
      {
        // אם כבר יש רישום מזוהה — רק מאחדים מונים וגבולות זמן; פרטי הגרסה
        // של הרישום המזוהה עדכניים לפחות כמו האנונימי ולכן נקבעים רק ביצירה
        $inc: { installCount: row.installCount || 1 },
        $min: { firstInstalledAt: row.firstInstalledAt || row.lastInstalledAt },
        $max: { lastInstalledAt: row.lastInstalledAt || row.firstInstalledAt },
        $setOnInsert: { version: row.version || '', appVersion: row.appVersion || null }
      },
      { upsert: true }
    )
    // דירוג שכבר קיים לתוסף הזה הופך למאומת מיד (מדרג ראשון ותובע אחר-כך)
    await promoteRatingToVerified({ userId, pluginId: row.pluginId, version: row.version })
  }

  await PluginAnonInstall.deleteMany({ anonId })
  return anonRows.length
}

// שדרוג דירוג קיים ל"מאומת" לאחר שנרשמה התקנה בפועל — למי שדירג לפני שהתקין
// מהאתר. מחזיר true אם דירוג עודכן (ואז האגרגט חושב מחדש).
export async function promoteRatingToVerified({ userId, pluginId, version }) {
  const result = await PluginRating.updateOne(
    { userId, pluginId, verifiedInstall: { $ne: true } },
    { $set: { verifiedInstall: true, verifiedVersion: version || null } }
  )
  if (result.modifiedCount > 0) {
    await recomputePluginRating(pluginId)
    return true
  }
  return false
}

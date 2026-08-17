import Plugin from '@/models/Plugin'
import PluginRating from '@/models/PluginRating'
import PluginInstall from '@/models/PluginInstall'
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

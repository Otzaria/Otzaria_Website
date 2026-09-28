// פרטי תוסף בודד לתצוגה הציבורית — משותף בין GET /api/plugins/[id] לבין
// דף התוסף (src/app/plugins/[id]/page.tsx, Server Component), כדי ששניהם
// יחזירו בדיוק את אותו מבנה נתונים.
//
// בדיקת הגישה לתוסף מושהה נשארת אצל הקורא: ה-API בודק session (מעלה/מנהל
// תוספים), והדף מדלג על רינדור-שרת לתוסף מושהה ומשאיר את הטעינה ל-API.
import Plugin from '@/models/Plugin'
import PluginCategory from '@/models/PluginCategory'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { formatVersionForPublic } from '@/lib/pluginVersions'
import { suspensionFields } from '@/lib/pluginVisibility'

// תוסף מושהה נשלף כאן במכוון (בלי סינון ההשהיה) — הוא נגיש בקישור ישיר
// למעלה התוסף ולמנהלי התוספים בלבד, והקורא בודק את הגישה מיד לאחר מכן.
export function findPluginForDetail(id) {
  return Plugin.findOne({ _id: id, isApproved: true, isHidden: false }).lean()
}

// בונה את גוף התשובה לתוסף שכבר נשלף ועבר את בדיקת הגישה. version = הגרסה
// הארכיונית המבוקשת (מ-parsePluginRef) או null. מחזיר null כשהתבקשה גרסה
// ארכיונית שאינה קיימת.
export async function buildPluginDetailPayload(plugin, id, version) {
  // קטגוריות החנות הגלויות שהתוסף משובץ בהן (אדיטיבי — לפירורי לחם וצ'יפים בדף התוסף)
  const categories = await PluginCategory.find({ isVisible: true, pluginIds: id })
    .sort({ order: 1 })
    .select('slug name')
    .lean()

  const livePublic = {
    ...formatPluginForPublic(plugin, {
      categories: categories.map((category) => ({ slug: category.slug, name: category.name }))
    }),
    // מצב ההשהיה — מגיע רק למי שרשאי לראות תוסף מושהה (הבדיקה אצל הקורא),
    // ומאפשר לדף התוסף להציג את שלט ההשהיה ואת כפתור ההחזרה לחנות.
    ...suspensionFields(plugin)
  }

  // גרסה ארכיונית ספציפית (שאינה הגרסה החיה).
  if (version && version !== plugin.version) {
    const entry = (plugin.versions || []).find((v) => v.version === version)
    if (!entry) return null
    return formatVersionForPublic(livePublic, plugin, entry)
  }

  return livePublic
}

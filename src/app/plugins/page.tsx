// דף הבית האצוּר של חנות התוספים (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.1):
// hero עם חיפוש, סרגל-צד קטגוריות (דסקטופ) / סרגל צ'יפים אופקי (מובייל),
// "תוספים נבחרים", שורות קטגוריה נבחרות ופס גילוי אל "כל התוספים".
// קישורים ישנים ?tag= מנותבים אל /plugins/all?tag= (תאימות לאחור).
//
// Server Component: הנתונים נשלפים ישירות מה-DB (אותה לוגיקה בדיוק כמו
// /api/plugins/store-home, ראו src/app/api/plugins/store-home/route.js) בזמן
// הרינדור, ולא בקריאת fetch מהדפדפן אחרי הטעינה.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת בזיכרון השרת עם תגיות
// PLUGINS_PUBLIC/STORE_SETTINGS/PLUGIN_CATEGORIES וחלון גיבוי קצר. כל route
// שמשנה תוסף/קטגוריה/הגדרות חנות קורא ל-revalidateTag על התגית המתאימה מיד
// אחרי כתיבה מוצלחת (ראו src/lib/cacheTags.js) — כך שהשעיית/מחיקת/אישור
// תוסף משתקפים מיד, בלי להמתין לחלון ה-revalidate. שדות "עוקבים" בתדירות
// גבוהה כמו downloadCount לא מקבלים תגית משלהם ומתעדכנים לכשעצמם בתוך חלון
// ה-revalidate (ראו ההסבר המלא ב-cacheTags.js) — זה מכוון, לא פספוס.
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import PluginModel from '@/models/Plugin'
import PluginCategory from '@/models/PluginCategory'
import { getStoreSettings } from '@/models/StoreSettings'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import {
  PUBLIC_PLUGIN_FILTER,
  fetchPublicPluginsByIds,
  orderByIds,
  orderCategoryPlugins,
  formatCategorySummary
} from '@/lib/pluginStore'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import PluginsStoreHomeClient from './PluginsStoreHomeClient'
import type { Plugin } from '@/components/plugins/types'
import type { StoreHomeData } from './storeHomeTypes'

// ISR: הדף עצמו (לא רק שאילתת ה-DB) נשמר במטמון עד revalidateTag או חלון זה.
// ערך זה חייב להישאר ליטרל מספרי (לא REVALIDATE_SECONDS.PLUGINS_PUBLIC) —
// ה-segment config של Next נחלץ ע"י ניתוח AST סטטי שלא תומך ב-property
// access על אובייקט מיובא, ומפיל את ה-build עם "Invalid segment configuration
// export detected". לעדכן ידנית יחד עם REVALIDATE_SECONDS.PLUGINS_PUBLIC.
export const revalidate = 600

async function loadStoreHomeDataUncached(): Promise<StoreHomeData> {
  await dbConnect()

  const [settings, categories, totalPublicPlugins] = await Promise.all([
    getStoreSettings(),
    PluginCategory.find({ isVisible: true }).sort({ order: 1 }).lean(),
    PluginModel.countDocuments(PUBLIC_PLUGIN_FILTER)
  ])

  // שאילתת תוספים אחת מרוכזת: נבחרים + כל המשובצים בקטגוריות
  const neededIds = [
    ...settings.featuredPluginIds,
    ...categories.flatMap((category) => category.pluginIds || [])
  ]
  const pluginsById = await fetchPublicPluginsByIds(neededIds)

  // התוספים הנבחרים נשארים בסדר הידני של המנהל
  // formatPluginForPublic (JS, לא-מוקלד) הוא אותה פונקציה בדיוק שה-API route
  // הישן משתמש בה; ה-cast כאן רק מגשר על ההיסק המבני של TS, ולא משנה נתונים.
  const featured: Plugin[] = orderByIds(settings.featuredPluginIds, pluginsById)
    .map((plugin) => formatPluginForPublic(plugin, { isFeatured: true }) as Plugin)

  const categoriesPayload = categories.map((category) => {
    // שורת דף-הבית מציגה את ראש הקטגוריה — ולכן באותו מיון בדיוק כמו דף הקטגוריה
    const publicPlugins = orderCategoryPlugins(category, pluginsById)
    return {
      ...formatCategorySummary(category, publicPlugins.length),
      showOnHome: category.showOnHome === true,
      plugins: category.showOnHome
        ? publicPlugins.slice(0, category.homeLimit || 6).map((plugin) => formatPluginForPublic(plugin) as Plugin)
        : []
    }
  })

  return {
    settings: {
      homeTitle: settings.homeTitle || '',
      homeSubtitle: settings.homeSubtitle || ''
    },
    featured,
    categories: categoriesPayload,
    totalPublicPlugins
  }
}

const loadStoreHomeData = nextCache(loadStoreHomeDataUncached, ['plugins-store-home'], {
  tags: [CACHE_TAGS.PLUGINS_PUBLIC, CACHE_TAGS.STORE_SETTINGS, CACHE_TAGS.PLUGIN_CATEGORIES],
  revalidate: REVALIDATE_SECONDS.PLUGINS_PUBLIC
})

export default async function PluginsPage() {
  let data: StoreHomeData | null = null
  let loadError = false
  try {
    data = await loadStoreHomeData()
  } catch (error) {
    console.error('Error loading store home:', error)
    loadError = true
  }

  return <PluginsStoreHomeClient data={data} loadError={loadError} />
}

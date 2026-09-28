// טיפוסי הנתונים של דף הבית של חנות התוספים — משותפים בין ה-Server Component
// (src/app/plugins/page.tsx, ששולף אותם מה-DB) לבין ה-Client Component
// (PluginsStoreHomeClient.tsx, שמציג אותם). זהה במבנה לתשובת /api/plugins/store-home,
// פרט לתוספים עצמם: רק שדות הכרטיס (PluginCardData, ראו src/lib/pluginCardData.js).

import type { PluginCardData, PluginCategorySummary } from '@/components/plugins/types'

export interface StoreHomeCategory extends PluginCategorySummary {
  showOnHome: boolean
  plugins: PluginCardData[]
}

export interface StoreHomeData {
  settings: { homeTitle: string; homeSubtitle: string }
  featured: PluginCardData[]
  categories: StoreHomeCategory[]
  totalPublicPlugins: number
}

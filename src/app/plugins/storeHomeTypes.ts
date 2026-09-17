// טיפוסי הנתונים של דף הבית של חנות התוספים — משותפים בין ה-Server Component
// (src/app/plugins/page.tsx, ששולף אותם מה-DB) לבין ה-Client Component
// (PluginsStoreHomeClient.tsx, שמציג אותם). זהה במבנה לתשובת /api/plugins/store-home.

import type { Plugin, PluginCategorySummary } from '@/components/plugins/types'

export interface StoreHomeCategory extends PluginCategorySummary {
  showOnHome: boolean
  plugins: Plugin[]
}

export interface StoreHomeData {
  settings: { homeTitle: string; homeSubtitle: string }
  featured: Plugin[]
  categories: StoreHomeCategory[]
  totalPublicPlugins: number
}

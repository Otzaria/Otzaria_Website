// טיפוס נתוני דף קטגוריה — משותף בין ה-Server Component (page.tsx, ששולף
// אותם מה-DB) לבין ה-Client Component (PluginCategoryClient.tsx, שמציג אותם).
// זהה במבנה לתשובת /api/plugins/categories/[slug], פרט לתוספים עצמם: רק שדות
// הכרטיס (PluginCardData, ראו src/lib/pluginCardData.js).

import type { PluginCardData } from '@/components/plugins/types'

export interface CategoryData {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  plugins: PluginCardData[]
  total: number
  // 'rating' = מסודר לפי דירוג (עם ראש רשימה מקובע ידנית), 'manual' = סדר ידני
  sortMode?: 'manual' | 'rating'
}

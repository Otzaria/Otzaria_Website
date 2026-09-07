// טיפוס נתוני דף קטגוריה — משותף בין ה-Server Component (page.tsx, ששולף
// אותם מה-DB) לבין ה-Client Component (PluginCategoryClient.tsx, שמציג אותם).
// זהה במבנה לתשובת /api/plugins/categories/[slug].

import type { Plugin } from '@/components/plugins/types'

export interface CategoryData {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  plugins: Plugin[]
  total: number
  // 'rating' = מסודר לפי דירוג (עם ראש רשימה מקובע ידנית), 'manual' = סדר ידני
  sortMode?: 'manual' | 'rating'
}

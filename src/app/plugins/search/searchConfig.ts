// משותף ל-page.tsx (שרת) ול-PluginSearchClient (לקוח). קובץ נפרד בכוונה:
// ערך שמיוצא מקובץ 'use client' מגיע ל-Server Component כ-client reference
// ולא כערך עצמו.
import type { PluginSearchResult } from '@/components/plugins/types'

// גודל עמוד התוצאות (העמוד הראשון בשרת, והמשך "טען עוד" בלקוח)
export const SEARCH_PAGE_SIZE = 20

// גוף התשובה של /api/plugins/search (ראו src/lib/pluginSearchResults.js)
export interface PluginSearchResponse {
  query: string
  total: number
  relaxed: boolean
  results: PluginSearchResult[]
}

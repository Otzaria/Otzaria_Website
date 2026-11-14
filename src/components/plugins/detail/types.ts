import type { CategoryRef } from '@/components/plugins/types'

// הפורמט שעמוד התוסף מקבל — בדיוק מה ש-GET /api/plugins/[id] מחזיר (src/lib/pluginDetail.js),
// ו-page.tsx מעביר כ-initialPlugin. שינוי חזותי בלבד: אין כאן שדה חדש מה-API — רק הצהרה על
// שדות שכבר הגיעו ולא הוצגו (versions, maxAppVersion).

/** רשומת גרסה (החיה + הארכיוניות) — buildVersionsList ב-src/lib/pluginSubmission.js */
export interface PluginVersionEntry {
  version: string
  status?: string
  compatibleWith?: string
  maxAppVersion?: string | null
  requiresNetwork?: boolean
  pluginFileSize?: number
  downloadUrl?: string
  releasedAt?: string | null
  supportsDirectInstall?: boolean
  isLatest?: boolean
}

export interface Plugin {
  id: string
  pluginUid?: string | null
  name: string
  shortDescription: string
  description: string
  version: string
  status: 'stable' | 'beta' | 'experimental'
  author: string
  updatedAt: string
  originalDate?: string
  fileUpdatedAt?: string
  compatibleWith: string
  maxAppVersion?: string | null
  requiresNetwork?: boolean
  tags: string[]
  image: string
  screenshots: string[]
  downloadUrl: string
  supportsDirectInstall: boolean
  homepage: string
  authorId?: string | null
  downloadCount?: number
  ratingAvg?: number
  ratingCount?: number
  ratingVerifiedCount?: number
  ratingBreakdown?: number[]
  pluginFileSize?: number
  isHistoricalVersion?: boolean
  latestVersion?: string
  // מצב השהיה — מוחזר רק למי שרשאי לראות תוסף מושהה (המעלה / מנהל תוספים)
  isSuspended?: boolean
  suspendedByRole?: 'owner' | 'admin' | null
  // הקטגוריות שהתוסף משובץ בהן (מוחזר מ-GET /api/plugins/[id])
  categories?: CategoryRef[]
  // כל הגרסאות הזמינות, מהגבוהה לנמוכה
  versions?: PluginVersionEntry[]
  // תוסף שפועל מול שירות מקומי (מתקין נפרד) — אזהרה, הוראות הסרה וחלון "אפשרויות הורדה"
  hasService?: boolean
}

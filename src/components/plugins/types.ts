// טיפוסים משותפים לדפי חנות התוספים (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.0)

// הפניה מינימלית לקטגוריה (כפי שמצורפת לתוסף ע"י ה-API)
export interface CategoryRef {
  slug: string
  name: string
}

// הפורמט הציבורי של תוסף (כפי שמוחזר מ-/api/plugins ודומיו)
export interface Plugin {
  id: string
  name: string
  shortDescription: string
  description: string
  version: string
  status: 'stable' | 'beta' | 'experimental'
  author: string
  updatedAt: string
  originalDate?: string
  compatibleWith: string
  tags: string[]
  image: string
  screenshots: string[]
  downloadUrl: string
  supportsDirectInstall: boolean
  homepage: string
  isPinned?: boolean
  downloadCount?: number
  // מצורף רק בנתיבים שמחשבים קטגוריות (דף תוסף, חיפוש)
  categories?: CategoryRef[]
}

// תקציר קטגוריה (כפי שמוחזר מ-/api/plugins/categories ומ-store-home)
export interface PluginCategorySummary {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  pluginCount: number
}

// תוצאת חיפוש — תוסף + נתוני דירוג (מ-/api/plugins/search)
export interface PluginSearchResult extends Plugin {
  score: number
  matchedFields: string[]
  categories: CategoryRef[]
}

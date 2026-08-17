// עזרי ולידציה ופורמט משותפים לנתיבי הניהול של קטגוריות החנות.
// (route.js של Next רשאי לייצא רק handlers — לכן ה-helpers כאן.)

export const CATEGORY_LIMITS = { name: 40, slug: 60, description: 300, icon: 60 }

// מצבי מיון בקטגוריה — ראו src/models/PluginCategory.js
export const SORT_MODES = ['manual', 'rating']
export const MAX_MANUAL_TOP = 20

// נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע נסיגה קטסטרופלית
// eslint-disable-next-line security/detect-unsafe-regex
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// populate מינימלי לתצוגת הניהול — כולל תוספים לא-מאושרים/מוסתרים (מסומנים בקליינט)
export const PLUGIN_PREVIEW_FIELDS = '_id name version status isApproved isHidden isSuspended downloadCount image'

export function validateCategoryData(data, { partial = false } = {}) {
  const errors = []
  if (!partial || data.name !== undefined) {
    const name = (data.name || '').trim()
    if (!name) errors.push('שם הקטגוריה הוא שדה חובה')
    if (name.length > CATEGORY_LIMITS.name) errors.push(`שם הקטגוריה חייב להכיל לכל היותר ${CATEGORY_LIMITS.name} תווים`)
  }
  if (data.slug !== undefined && !SLUG_RE.test(data.slug || '')) {
    errors.push('slug חייב להכיל אותיות לטיניות קטנות, ספרות ומקפים בלבד (למשל study-tools)')
  }
  if (data.slug !== undefined && (data.slug || '').length > CATEGORY_LIMITS.slug) {
    errors.push(`slug חייב להכיל לכל היותר ${CATEGORY_LIMITS.slug} תווים`)
  }
  if (data.description !== undefined && (data.description || '').length > CATEGORY_LIMITS.description) {
    errors.push(`תיאור הקטגוריה חייב להכיל לכל היותר ${CATEGORY_LIMITS.description} תווים`)
  }
  if (data.icon !== undefined && (data.icon || '').length > CATEGORY_LIMITS.icon) {
    errors.push(`שם האייקון חייב להכיל לכל היותר ${CATEGORY_LIMITS.icon} תווים`)
  }
  if (data.homeLimit !== undefined) {
    const homeLimit = Number(data.homeLimit)
    if (!Number.isInteger(homeLimit) || homeLimit < 3 || homeLimit > 12) {
      errors.push('מספר התוספים בשורת דף הבית חייב להיות בין 3 ל-12')
    }
  }
  if (data.sortMode !== undefined && !SORT_MODES.includes(data.sortMode)) {
    errors.push('מצב מיון לא תקין')
  }
  if (data.manualTopCount !== undefined) {
    const manualTopCount = Number(data.manualTopCount)
    if (!Number.isInteger(manualTopCount) || manualTopCount < 0 || manualTopCount > MAX_MANUAL_TOP) {
      errors.push(`מספר התוספים המקובעים בראש הקטגוריה חייב להיות בין 0 ל-${MAX_MANUAL_TOP}`)
    }
  }
  return errors
}

export function formatAdminCategory(category) {
  const plugins = (category.pluginIds || [])
    .filter((plugin) => plugin && typeof plugin === 'object' && plugin._id)
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description || '',
    icon: category.icon || '',
    order: category.order ?? 0,
    showOnHome: category.showOnHome === true,
    homeLimit: category.homeLimit || 6,
    // נעדר במסמכים ותיקים = 'rating' (זהה לחישוב הציבורי ב-resolveSortMode)
    sortMode: category.sortMode === 'manual' ? 'manual' : 'rating',
    manualTopCount: category.manualTopCount || 0,
    isVisible: category.isVisible !== false,
    // המשובצים בסדרם, עם דגלים לזיהוי "רפאים" (לא יוצג בפועל) בתצוגת הניהול
    plugins: plugins.map((plugin) => ({
      id: plugin._id.toString(),
      name: plugin.name,
      version: plugin.version,
      status: plugin.status,
      isApproved: plugin.isApproved === true,
      isHidden: plugin.isHidden === true,
      isSuspended: plugin.isSuspended === true,
      downloadCount: plugin.downloadCount || 0,
      image: plugin.image?.ext ? `/api/plugins/${plugin._id}/image` : null
    })),
    // מזהים שלא עברו populate (תוסף שנמחק פיזית) — מדווחים כדי שהניהול יוכל לנקות
    ghostCount: (category.pluginIds || []).length - plugins.length,
    updatedAt: category.updatedAt
  }
}

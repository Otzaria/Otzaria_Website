// "סידור החנות" — לוגיקה טהורה: הסדר של הנבחרים, טופס הקטגוריה (שם, כתובת, הצגה בדף הבית, סדר),
// ותוסף "שלא יוצג בפועל". טסט: storeLayout.test.mjs. הבקשות עצמן — ב-components/admin/plugins.

/** החלפת מקומות בין פריט לשכנו (כפתורי ↑ ↓) */
export function moveItem(list, index, direction) {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

/** העברת פריט מאינדקס לאינדקס (גרירה) */
export function reorderList(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export const DEFAULT_HOME_TITLE = 'חנות התוספים של אוצריא'
export const DEFAULT_HOME_SUBTITLE = 'הרחיבו את אוצריא עם תוספים מהקהילה'
/** מעל זה — המלצה בלבד (התקרה בשרת: 100) */
export const FEATURED_SOFT_LIMIT = 8

/** תוסף מרשימת הניהול (GET /api/admin/plugins) בצורה של רשימות הסידור */
export function toLayoutPlugin(plugin) {
  return {
    id: plugin._id,
    name: plugin.name,
    version: plugin.version,
    status: plugin.status,
    isApproved: plugin.isApproved !== false,
    isHidden: plugin.isHidden === true,
    isSuspended: plugin.isSuspended === true,
    downloadCount: plugin.downloadCount || 0,
    image: plugin.image?.ext ? `/api/plugins/${plugin._id}/image` : null,
  }
}

/**
 * הגדרות דף הבית כפי שנשמרו — לזיהוי שינוי שלא נשמר, ול"בטל שינויים". plugins — התוספים עצמם ולא רק
 * המזהים: נבחר יכול להיות תוסף שכבר אינו ברשימת המאושרים (הוחזר להמתנה), וביטול חייב להחזיר גם אותו.
 */
export function settingsSnapshot(settings) {
  const plugins = settings?.featuredPlugins || []
  return {
    plugins,
    ids: plugins.map((p) => p.id),
    homeTitle: settings?.homeTitle || '',
    homeSubtitle: settings?.homeSubtitle || '',
  }
}

/** יש שינוי שלא נשמר: הסדר / הרשימה של הנבחרים, או הכותרות */
export function settingsDirty(saved, { featured, homeTitle, homeSubtitle }) {
  return homeTitle !== saved.homeTitle
    || homeSubtitle !== saved.homeSubtitle
    || featured.map((p) => p.id).join(',') !== saved.ids.join(',')
}

/** ההכרזה לקורא מסך אחרי הזזה: index — המקום החדש, מ-0 */
export function movedNotice(name, index, count) {
  return `״${name}״ הועבר למקום ${index + 1} מתוך ${count}`
}

/** תוסף משובץ שלא יוצג בפועל (לא מאושר / מוסתר / מושהה) — ולמה */
export function hiddenReason(plugin) {
  if (!plugin) return null
  if (plugin.isApproved === false) return 'לא מאושר — לא יוצג'
  if (plugin.isHidden) return 'מוסתר — לא יוצג'
  if (plugin.isSuspended) return 'מושהה — לא יוצג'
  return null
}

/** כמה מהמשובצים בקטגוריה יוצגו בפועל */
export function visibleInCategory(category) {
  return (category?.plugins || []).filter((p) => !hiddenReason(p)).length
}

// ---------- טופס הקטגוריה ----------

// זהה ל-SLUG_RE בצד השרת (src/lib/pluginCategoryAdmin.js)
// נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע נסיגה קטסטרופלית
// eslint-disable-next-line security/detect-unsafe-regex
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** הצעה לכתובת מתוך שם לטיני — אותיות קטנות, ספרות ומקפים בלבד ("Study Tools" → "study-tools") */
export function clientSlugify(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const hasHebrew = (text) => /[֐-׿]/.test(text || '')

export function initialCategoryForm(category) {
  return {
    name: category?.name || '',
    slug: category?.slug || '',
    description: category?.description || '',
    icon: category?.icon || '',
    showOnHome: category?.showOnHome === true,
    homeLimit: category?.homeLimit || 6,
    sortMode: category?.sortMode === 'manual' ? 'manual' : 'rating',
    manualTopCount: category?.manualTopCount || 0,
    isVisible: category ? category.isVisible !== false : true,
  }
}

/** בעיות בטופס, בעברית (ריק — אפשר לשמור) */
export function categoryFormErrors(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'כתוב שם לקטגוריה.'
  if (!form.slug) errors.slug = hasHebrew(form.name) ? 'לשם בעברית צריך לכתוב כתובת באנגלית, למשל study-tools.' : 'כתוב כתובת לדף הקטגוריה.'
  else if (!SLUG_RE.test(form.slug)) errors.slug = 'רק אותיות באנגלית קטנות, ספרות ומקפים, למשל study-tools.'
  const limit = Number(form.homeLimit)
  if (form.showOnHome && !(limit >= 3 && limit <= 12)) errors.homeLimit = 'בין 3 ל-12.'
  const top = Number(form.manualTopCount)
  if (form.sortMode === 'rating' && !(top >= 0 && top <= 20)) errors.manualTopCount = 'בין 0 ל-20.'
  return errors
}

/** מה נשלח לשרת — אותם שדות בדיוק כמו קודם (POST / PATCH update) */
export function categoryPayload(form) {
  return {
    name: form.name.trim(),
    slug: form.slug,
    description: form.description.trim(),
    icon: form.icon.trim(),
    showOnHome: form.showOnHome,
    homeLimit: Number(form.homeLimit),
    sortMode: form.sortMode,
    manualTopCount: Number(form.manualTopCount) || 0,
  }
}

const comparable = (form) => JSON.stringify({ ...categoryPayload(form), isVisible: form.isVisible })

/**
 * האם השתנה משהו בטופס מאז שנפתח או נשמר. משווים את מה שיישלח לשרת, לא את הטופס: "7" מהשדה שווה ל-7
 * מהשרת, ורווח בקצה שם לא נחשב (נחתך בשליחה).
 * @param {object} saved — קטגוריה מהשרת, או טופס שנשמר
 */
export function categoryFormDirty(form, saved) {
  return comparable(form) !== comparable(initialCategoryForm(saved))
}

/** האם השתנו התוספים בקטגוריה או הסדר שלהם */
export function categoryPluginsDirty(assigned, saved) {
  return assigned.map((p) => p.id).join(',') !== saved.map((p) => p.id).join(',')
}

// הבקשות של מסך התוספים — אותן נקודות קצה, אותן שיטות ואותם גופים בדיוק כמו המסך הקודם (בלי שינוי
// בחוזה). העטיפה (adminRequest) מוסיפה: התחברות שפגה מזוהה, תקרת זמן, והודעת שגיאה בעברית.
import { requestJson } from '@/components/admin/list/adminRequest'

const plugin = (id) => `/api/admin/plugins/${encodeURIComponent(id)}`
const category = (id) => `/api/admin/plugin-categories/${encodeURIComponent(id)}`

/** @param {'pending' | 'approved'} status */
export const listPlugins = (status) => requestJson(`/api/admin/plugins?status=${status}`, {
  fallback: status === 'pending' ? 'לא הצלחנו לטעון את התוספים שממתינים לאישור.' : 'לא הצלחנו לטעון את התוספים שבחנות.',
})

export const listCategories = () => requestJson('/api/admin/plugin-categories', { fallback: 'לא הצלחנו לטעון את הקטגוריות.' })

/** אישור; לתוסף חדש — גם שיבוץ לקטגוריות והוספה לנבחרים (בשרת, יחד עם האישור) */
export const approvePlugin = (id, { categoryIds = [], addToFeatured = false } = {}) => requestJson(plugin(id), {
  method: 'PATCH',
  body: { action: 'approve', ...(categoryIds.length > 0 ? { categoryIds } : {}), ...(addToFeatured ? { addToFeatured: true } : {}) },
  fallback: 'לא הצלחנו לאשר את התוסף.',
  timeoutMs: 120000,
})

/** @param {'unapprove' | 'suspend' | 'resume'} action */
export const pluginAction = (id, action) => requestJson(plugin(id), {
  method: 'PATCH',
  body: { action },
  fallback: {
    unapprove: 'לא הצלחנו להחזיר את התוסף להמתנה.',
    suspend: 'לא הצלחנו להשהות את התוסף.',
    resume: 'לא הצלחנו להחזיר את התוסף לחנות.',
  }[action],
})

/** דחייה (הגשה / עדכון) ומחיקה לצמיתות — אותה נקודת קצה (DELETE) */
export const deletePlugin = (id, fallback) => requestJson(plugin(id), { method: 'DELETE', fallback, timeoutMs: 60000 })

export const deleteVersion = (id, version) => requestJson(`${plugin(id)}/versions/${encodeURIComponent(version)}`, {
  method: 'DELETE',
  fallback: 'לא הצלחנו למחוק את הגרסה.',
})

/** טופס העריכה (PluginEditModal) — הנתונים שלו */
export const loadEditData = (id) => requestJson(`${plugin(id)}/edit`, { fallback: 'לא הצלחנו לפתוח את העריכה.' })

export const loadRatings = (id) => requestJson(`${plugin(id)}/ratings`, { fallback: 'לא הצלחנו לטעון את הדירוגים.' })

/** @param {'hide' | 'unhide'} action */
export const setRatingHidden = (id, ratingId, action) => requestJson(`${plugin(id)}/ratings`, {
  method: 'PATCH',
  body: { ratingId, action },
  fallback: 'לא הצלחנו לעדכן את הדירוג.',
})

/** שיבוץ / הסרה של תוסף בקטגוריה — נשמר מיד */
export const toggleCategoryPlugin = (categoryId, pluginId, checked) => requestJson(category(categoryId), {
  method: 'PATCH',
  body: { action: checked ? 'addPlugin' : 'removePlugin', pluginId },
  fallback: 'לא הצלחנו לעדכן את השיבוץ.',
})

// ---------- סידור החנות ----------

export const loadStoreSettings = () => requestJson('/api/admin/store-settings', { fallback: 'לא הצלחנו לטעון את הגדרות דף הבית.' })
export const loadUnplaced = () => requestJson('/api/admin/plugin-store/unplaced', { fallback: 'לא הצלחנו לטעון את התוספים שלא שובצו.' })

export const saveStoreSettings = ({ featuredPluginIds, homeTitle, homeSubtitle }) => requestJson('/api/admin/store-settings', {
  method: 'PATCH',
  body: { featuredPluginIds, homeTitle, homeSubtitle },
  fallback: 'לא הצלחנו לשמור את השינויים.',
})

/** הוספה אחת לנבחרים ($addToSet בשרת) — לא דורסת שינויים של מנהל אחר */
export const addFeatured = (pluginId) => requestJson('/api/admin/store-settings', {
  method: 'PATCH',
  body: { action: 'addFeatured', pluginId },
  fallback: 'לא הצלחנו להוסיף לנבחרים.',
})

export const reorderCategory = (id, order) => requestJson(category(id), {
  method: 'PATCH',
  body: { action: 'reorder', order },
  fallback: 'לא הצלחנו לשנות את סדר הקטגוריות.',
})

export const createCategory = (payload) => requestJson('/api/admin/plugin-categories', {
  method: 'POST',
  body: payload,
  fallback: 'לא הצלחנו ליצור את הקטגוריה.',
})

export const updateCategory = (id, data) => requestJson(category(id), {
  method: 'PATCH',
  body: { action: 'update', data },
  fallback: 'לא הצלחנו לשמור את הקטגוריה.',
})

export const setCategoryPlugins = (id, pluginIds) => requestJson(category(id), {
  method: 'PATCH',
  body: { action: 'setPlugins', pluginIds },
  fallback: 'לא הצלחנו לשמור את השיבוץ.',
})

export const deleteCategory = (id) => requestJson(category(id), { method: 'DELETE', fallback: 'לא הצלחנו למחוק את הקטגוריה.' })

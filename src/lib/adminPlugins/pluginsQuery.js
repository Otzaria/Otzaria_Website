// מסך התוספים בניהול — התצוגות, הסינון, המיון והעימוד. לוגיקה טהורה (בלי React ובלי DOM); טסט:
// pluginsQuery.test.mjs. הכול נשמר בכתובת, כדי שקישור (מהסרגל, מהלוח, ממייל) יפתח בדיוק את מה שצריך,
// ושחזרה אחורה תחזיר לאותו מקום.
//
// התצוגות (?view=): pending — לאישור (ברירת המחדל, גם בכתובת בלי פרמטר) · store — בחנות ·
// layout — סידור החנות · service — תוספי שירות.
// כתובות ישנות (?tab=pending|approved|store|service, מהמסך הקודם) — ממשיכות לעבוד ומתורגמות לתצוגה.
//
// פרמטרים של הרשימה: q (חיפוש: שם, מפתח, מי שהעלה, תגיות) · kind (לאישור: new / update) ·
// state (בחנות: active / suspended) · cat (בחנות: מזהה קטגוריה, או none — לא משובץ) · sort · page.
// מגירת התוסף: plugin (מזהה) · pane (הלשונית שבמגירה). ערך ברירת מחדל לא נכתב; ערך לא מוכר נזרק.
import { normalizeHebrew } from '../hebrewSearchNormalize.js'
import { paginate as paginateList } from '../adminList/paginate.js'

export const PLUGINS_PATH = '/library/admin/plugins'
export const PLUGIN_VIEWS = ['pending', 'store', 'layout', 'service']
export const DEFAULT_VIEW = 'pending'

/** שמות התצוגות — אותם שמות בסרגל, בלשוניות ובכותרת */
export const VIEW_LABELS = {
  pending: 'לאישור',
  store: 'בחנות',
  layout: 'סידור החנות',
  service: 'תוספי שירות',
}

/** השמות בלשוניות בטלפון, כדי שכולן ייכנסו בלי גלילה */
export const VIEW_SHORT_LABELS = { layout: 'סידור', service: 'שירות' }

// הלשוניות של המסך הקודם (מצב פנימי, לא בכתובת) — קישורים ישנים עם ?tab= עדיין נפתחים נכון. משותף גם לסרגל
// (adminNav), כדי ששניהם יסמנו אותה תצוגה.
export const LEGACY_PLUGIN_TABS = { pending: 'pending', approved: 'store', store: 'layout', service: 'service' }

export const PENDING_KINDS = ['new', 'update', 'returned']
export const STORE_STATES = ['active', 'suspended']
export const PENDING_SORTS = ['oldest', 'newest', 'name']
export const STORE_SORTS = ['name', 'updated', 'downloads', 'rating']
export const DRAWER_PANES = ['overview', 'versions', 'ratings', 'assign']
/** "לא משובץ" בבורר הקטגוריה */
export const NO_CATEGORY = 'none'
export const PLUGINS_PER_PAGE = 20

const DEFAULT_SORT = { pending: 'oldest', store: 'name' }
const PARAM_ORDER = ['view', 'q', 'kind', 'state', 'cat', 'sort', 'page', 'plugin', 'pane']

/** @typedef {{ view: string, q: string, kind: string, state: string, cat: string, sort: string, page: number, plugin: string, pane: string }} PluginsQuery */

function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/** התצוגה מתוך הכתובת: ?view=, אחר כך ?tab= הישן, ואחרת — "לאישור" */
export function viewFromParams(params) {
  const get = reader(params)
  const view = get('view')
  if (PLUGIN_VIEWS.includes(view)) return view
  const legacy = LEGACY_PLUGIN_TABS[get('tab')]
  return legacy || DEFAULT_VIEW
}

/** הכתובת של תצוגה — "לאישור" בלי פרמטר (הכתובת הישנה של המסך) */
export function viewHref(view) {
  return view === DEFAULT_VIEW || !PLUGIN_VIEWS.includes(view) ? PLUGINS_PATH : `${PLUGINS_PATH}?view=${view}`
}

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {PluginsQuery}
 */
export function parsePluginsQuery(params) {
  const get = reader(params)
  const view = viewFromParams(params)
  const kind = get('kind')
  const state = get('state')
  const sort = get('sort')
  const page = Number.parseInt(get('page'), 10)
  const pane = get('pane')
  const sorts = view === 'store' ? STORE_SORTS : PENDING_SORTS
  return {
    view,
    q: get('q').slice(0, 200),
    kind: view === 'pending' && PENDING_KINDS.includes(kind) ? kind : '',
    state: view === 'store' && STORE_STATES.includes(state) ? state : '',
    cat: view === 'store' ? get('cat').slice(0, 64) : '',
    sort: sorts.includes(sort) ? sort : (DEFAULT_SORT[view] || ''),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    plugin: /^[A-Za-z0-9_-]{1,64}$/.test(get('plugin')) ? get('plugin') : '',
    pane: DRAWER_PANES.includes(pane) ? pane : '',
  }
}

/** הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע; "" כשאין כלום */
export function serializePluginsQuery(query) {
  const params = new URLSearchParams()
  const view = PLUGIN_VIEWS.includes(query?.view) ? query.view : DEFAULT_VIEW
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (value === undefined || value === null || value === '') continue
    if (name === 'view' && value === DEFAULT_VIEW) continue
    if (name === 'sort' && value === DEFAULT_SORT[view]) continue
    if (name === 'page' && Number(value) <= 1) continue
    params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** שינוי בסינון / במיון — חוזרים לעמוד הראשון (חוץ משינוי העמוד עצמו או המגירה) */
export function updatePluginsQuery(query, patch) {
  const keepsPage = 'page' in patch || 'plugin' in patch || 'pane' in patch
  return { ...query, ...patch, page: keepsPage ? (patch.page ?? query.page) : 1 }
}

export function hasActiveFilters(query) {
  return Boolean(query.q || query.kind || query.state || query.cat)
}

export function activeFilterCount(query) {
  return [query.kind, query.state, query.cat].filter(Boolean).length
}

export function clearFilters(query) {
  return { ...query, q: '', kind: '', state: '', cat: '', page: 1 }
}

/** קטגוריה שלא קיימת (נמחקה, כתובת ישנה) נזרקת — כשהקטגוריות ידועות */
export function sanitizePluginsQuery(query, { categoryIds = null } = {}) {
  if (!query.cat || query.cat === NO_CATEGORY || !categoryIds) return query
  return categoryIds.includes(query.cat) ? query : { ...query, cat: '' }
}

// ---------- התוסף עצמו ----------

/**
 * מה יש בתור — לפי אותו תנאי שהשרת בודק ב-DELETE, כי ממנו נגזר מה "דחה" מוחק:
 *   update — תוסף בחנות עם עדכון שממתין: נמחק רק העדכון.
 *   returned — תוסף שהוחזר להמתנה ויש לו עבר (גרסאות, הורדות, דירוגים, או עדכון שממתין): נמחק הכול.
 *     unapprove לא מנקה pendingUpdate, ולכן pendingUpdate לבדו לא אומר "עדכון".
 *   new — הגשה חדשה: נמחקת.
 * @returns {'new' | 'update' | 'returned'}
 */
export function submissionKind(plugin) {
  if (plugin?.isApproved) return plugin.pendingUpdate ? 'update' : 'new'
  const history = plugin?.pendingUpdate || plugin?.versions?.length > 0 || plugin?.downloadCount > 0 || plugin?.ratingCount > 0
  return history ? 'returned' : 'new'
}

/** מה נבדק: בעדכון — הגרסה שהוגשה (pendingUpdate), אחרת — התוסף עצמו */
export function reviewSource(plugin) {
  return plugin?.pendingUpdate || plugin || {}
}

/** תאריך ההגשה (לאישור) */
export function submittedAt(plugin) {
  return plugin?.lastSubmittedAt || plugin?.createdAt || null
}

function time(value) {
  const t = value ? Date.parse(value) : NaN
  return Number.isFinite(t) ? t : 0
}

function searchText(plugin) {
  const source = reviewSource(plugin)
  return normalizeHebrew([
    plugin.name, source.name, source.author, plugin.author,
    plugin.authorId?.name, plugin.lastSubmittedBy?.name, ...(source.tags || []),
  ].filter(Boolean).join(' '))
}

function matchesSearch(plugin, q) {
  const needle = normalizeHebrew(q)
  return !needle || searchText(plugin).includes(needle)
}

const byName = (a, b) => String(reviewSource(a).name || '').localeCompare(String(reviewSource(b).name || ''), 'he')

/** תור "לאישור": חיפוש וסוג; ברירת המחדל — הוותיק ראשון (מי שמחכה הכי הרבה זמן) */
export function filterPending(plugins, query) {
  const out = (plugins || []).filter((p) => matchesSearch(p, query.q) && (!query.kind || submissionKind(p) === query.kind))
  const sorted = [...out]
  if (query.sort === 'name') sorted.sort(byName)
  else if (query.sort === 'newest') sorted.sort((a, b) => time(submittedAt(b)) - time(submittedAt(a)) || byName(a, b))
  else sorted.sort((a, b) => time(submittedAt(a)) - time(submittedAt(b)) || byName(a, b))
  return sorted
}

/**
 * לאילו קטגוריות כל תוסף משובץ: Map של מזהה תוסף → [מזהי קטגוריות] (לפי סדר הקטגוריות).
 * @param {{ id: string, plugins: { id: string }[] }[]} categories
 */
export function categoryAssignments(categories) {
  const map = new Map()
  for (const category of categories || []) {
    for (const plugin of category.plugins || []) {
      const list = map.get(plugin.id) || []
      list.push(category.id)
      map.set(plugin.id, list)
    }
  }
  return map
}

/** "בחנות": חיפוש, מצב (פעיל / מושהה) וקטגוריה; assignments — מ-categoryAssignments */
export function filterStore(plugins, query, assignments = new Map()) {
  const out = (plugins || []).filter((p) => {
    if (!matchesSearch(p, query.q)) return false
    if (query.state === 'suspended' && p.isSuspended !== true) return false
    if (query.state === 'active' && p.isSuspended === true) return false
    if (query.cat) {
      const cats = assignments.get(p._id) || []
      if (query.cat === NO_CATEGORY ? cats.length > 0 : !cats.includes(query.cat)) return false
    }
    return true
  })
  const sorted = [...out]
  if (query.sort === 'updated') sorted.sort((a, b) => time(b.updatedAt || b.approvedAt) - time(a.updatedAt || a.approvedAt) || byName(a, b))
  else if (query.sort === 'downloads') sorted.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0) || byName(a, b))
  else if (query.sort === 'rating') sorted.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0) || (b.ratingCount || 0) - (a.ratingCount || 0) || byName(a, b))
  else sorted.sort(byName)
  return sorted
}

/** כמה בכל סוג — לבורר "סוג" בתור */
export function countPendingKinds(plugins) {
  const out = { new: 0, update: 0, returned: 0 }
  for (const p of plugins || []) out[submissionKind(p)] += 1
  return out
}

/** כמה מושהים / פעילים — לבורר "מצב" */
export function countStoreStates(plugins) {
  let suspended = 0
  for (const p of plugins || []) if (p.isSuspended === true) suspended += 1
  return { active: (plugins?.length || 0) - suspended, suspended }
}

export function paginate(items, page, size = PLUGINS_PER_PAGE) {
  return paginateList(items, page, size)
}

/** איזה מצב ריק: אין בכלל (all), או שהסינון לא מצא (filtered); null — יש מה להציג */
export function emptyKind({ total, shown }) {
  if (shown > 0) return null
  return total === 0 ? 'all' : 'filtered'
}

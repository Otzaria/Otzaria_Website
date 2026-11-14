// הסינון, המיון והעימוד של מסך ההעלאות — לוגיקה טהורה. הכול נשמר בכתובת (query string), כדי
// שקישור — למשל מהלוח — יפתח את המסך מסונן, ושחזרה אחורה תחזיר לאותו מקום.
//
// פרמטרים: q (חיפוש בשם הספר) · type (full_book / single_page) · user (מפתחות מעלים, כמה) ·
// status (מצבי ספר — bookStatus, כמה) · sort (newest / oldest / name) · page (מ-1).
// כמה ערכים: מופרדים בפסיק (status=a,b) או חוזרים (status=a&status=b) — שתי הצורות נקראות.
// ערך ברירת מחדל לא נכתב בכתובת; ערך לא מוכר נזרק — type / sort / page כבר בקריאה, ומצב / משתמש
// שאינם ברשימה — ב-sanitizeUploadsQuery, כשהנתונים ידועים. כך הכתובת תמיד אומרת מה מוצג באמת.
import { normalizeHebrew } from '../hebrewSearchNormalize.js'
import { paginate as paginateList } from '../adminList/paginate.js'
import { uploaderKey, uploadItemLabel } from './uploadGroups.js'

/** סוגי ההעלאה שאפשר לסנן לפיהם. "דיקטה" הוסר מהסינון (#228) — העלאות ישנות כאלה מופיעות ב"הכול". */
export const UPLOAD_TYPE_FILTERS = ['full_book', 'single_page']
export const UPLOAD_SORTS = ['newest', 'oldest', 'name']
/** כמה ספרים (קבוצות) בכל עמוד */
export const GROUPS_PER_PAGE = 25
/** תקרה לכמה ערכים בפרמטר אחד ולאורך ערך — כתובת ידנית / זדונית לא מנפחת את המסך */
const MAX_VALUES = 50
const MAX_VALUE_LENGTH = 200

export const DEFAULT_UPLOADS_QUERY = Object.freeze({ q: '', type: '', user: Object.freeze([]), status: Object.freeze([]), sort: 'newest', page: 1 })

// סדר קבוע בכתובת — כך אותו סינון נותן תמיד אותה כתובת
const PARAM_ORDER = ['q', 'type', 'user', 'status', 'sort', 'page']
const LIST_PARAMS = new Set(['user', 'status'])

/** @typedef {{ q: string, type: string, user: string[], status: string[], sort: string, page: number }} UploadsQuery */

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {UploadsQuery}
 */
export function parseUploadsQuery(params) {
  const all = (name) => {
    if (!params) return []
    const value = typeof params.getAll === 'function' ? params.getAll(name) : params[name]
    return (Array.isArray(value) ? value : [value]).filter((v) => v !== undefined && v !== null).map(String)
  }
  const get = (name) => (all(name)[0] ?? '').trim()
  // פרמטר אחד — מפוצל בפסיקים; כמה פרמטרים חוזרים — כל אחד כמו שהוא (מפתח שיש בו פסיק)
  const list = (name) => {
    const raw = all(name)
    const parts = raw.length === 1 ? raw[0].split(',') : raw
    const out = []
    for (const part of parts) {
      const value = part.trim().slice(0, MAX_VALUE_LENGTH)
      if (value && !out.includes(value)) out.push(value)
      if (out.length >= MAX_VALUES) break
    }
    return out
  }
  const type = get('type')
  const sort = get('sort')
  const page = Number.parseInt(get('page'), 10)
  return {
    q: get('q').slice(0, 200),
    type: UPLOAD_TYPE_FILTERS.includes(type) ? type : '',
    user: list('user'),
    status: list('status'),
    sort: UPLOAD_SORTS.includes(sort) ? sort : DEFAULT_UPLOADS_QUERY.sort,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/**
 * הכתובת של שאילתה — בלי ערכי ברירת מחדל, ובסדר קבוע. מחרוזת ריקה כשאין כלום ("" ולא "?").
 * רשימה — בפסיקים; אם באחד הערכים יש פסיק — פרמטרים חוזרים (וערך יחיד כזה — פעמיים, כדי שלא
 * יפוצל בקריאה; הכפילות נזרקת שם).
 * @param {Partial<UploadsQuery>} query
 */
export function serializeUploadsQuery(query) {
  const params = new URLSearchParams()
  let commaInValue = false
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (LIST_PARAMS.has(name)) {
      const values = (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean)
      if (values.length === 0) continue
      if (values.some((v) => v.includes(','))) {
        commaInValue = true
        for (const v of values) params.append(name, v)
        if (values.length === 1) params.append(name, values[0])
      } else {
        params.set(name, values.join(','))
      }
      continue
    }
    if (value === undefined || value === null || value === '') continue
    if (value === DEFAULT_UPLOADS_QUERY[name]) continue
    params.set(name, String(value))
  }
  // פסיק כמפריד נשאר קריא בכתובת (status=a,b ולא status=a%2Cb) — אלא אם הוא חלק מערך
  const text = commaInValue ? params.toString() : params.toString().replace(/%2C/g, ',')
  return text ? `?${text}` : ''
}

/**
 * עדכון שאילתה: כל שינוי בסינון או במיון מחזיר לעמוד הראשון (אלא אם נקבע עמוד במפורש).
 * @param {UploadsQuery} query
 * @param {Partial<UploadsQuery>} patch
 */
export function updateUploadsQuery(query, patch) {
  const next = { ...query, ...patch }
  if (!('page' in patch)) next.page = 1
  return next
}

/** האם יש סינון פעיל (המיון והעמוד אינם סינון) */
export function hasActiveFilters(query) {
  return Boolean(query?.q || query?.type || query?.user?.length || query?.status?.length)
}

/** כמה בוררי סינון פעילים (לכפתור "סינון (2)" בטלפון) */
export function activeFilterCount(query) {
  return [query?.type, query?.status?.length, query?.user?.length].filter(Boolean).length
}

/** הסינון בלבד, בלי מיון ועמוד — לניקוי סינון ששומר את המיון */
export function clearFilters(query) {
  return { ...query, q: '', type: '', user: [], status: [], page: 1 }
}

/**
 * השאילתה כפי שהיא חלה על הנתונים: מצבים ומשתמשים שלא קיימים (כתובת ישנה, הקלדה ידנית — "?status=xyz")
 * נזרקים, כדי שהבורר יראה בדיוק את מה שמסנן ולא "הכול" מעל רשימה ריקה. באשפה אין מצב ספר (השרת
 * לא מחזיר אותו), ולכן שם המצב לא חל בכלל. מחזיר את אותו אובייקט כשאין מה לזרוק.
 * @param {UploadsQuery} query
 * @param {{ tab: 'uploads' | 'trash', statusKeys?: Iterable<string> | null, userKeys?: Iterable<string> | null }} known
 *   statusKeys / userKeys — null כשעוד לא ידוע (לפני טעינה) — אז לא זורקים כלום.
 */
export function sanitizeUploadsQuery(query, { tab, statusKeys, userKeys }) {
  const keep = (values, keys) => {
    if (!keys) return values
    const set = keys instanceof Set ? keys : new Set(keys)
    const kept = values.filter((v) => set.has(v))
    return kept.length === values.length ? values : kept
  }
  const status = tab === 'trash' ? [] : keep(query.status, statusKeys)
  const user = keep(query.user, userKeys)
  if (status.length === query.status.length && user === query.user) return query
  return { ...query, status, user }
}

// ----- חיפוש -----

// טקסט החיפוש המנורמל של כל העלאה — מחושב פעם אחת לכל אובייקט (WeakMap): ההעלאה לא משתנה במקום
// (שינוי מצב יוצר אובייקט חדש, ורק הוא מחושב מחדש). כך חיפוש ב-4,000 העלאות הוא includes בלבד.
const searchTexts = new WeakMap()

/** טקסט החיפוש של העלאה: שם הספר, שם הקובץ והתווית ("עמוד 5"), מנורמלים */
export function uploadSearchText(upload) {
  if (!upload || typeof upload !== 'object') return ''
  let text = searchTexts.get(upload)
  if (text === undefined) {
    text = normalizeHebrew(`${upload.bookName || ''} ${upload.originalFileName || ''} ${uploadItemLabel(upload)}`)
    searchTexts.set(upload, text)
  }
  return text
}

/**
 * מסנן את הקבוצות: בכל קבוצה נשארות רק ההעלאות שמתאימות (visible), וקבוצה בלי התאמות יוצאת.
 * הקבוצה עצמה (uploads) נשארת שלמה — מצב הספר מחושב ממנה. earliest / latest — של הגלויות,
 * כדי ש"הוותיקים קודם" ימיין לפי מה שמוצג (ולא לפי עמוד ישן שכבר טופל).
 * חיפוש: כל המילים מופיעות בשם הספר / במיקום / בשם הקובץ / בתווית (מנורמל).
 * @param {import('./uploadGroups.js').UploadGroup[]} groups
 * @param {UploadsQuery} query
 * @param {{ dateField?: string }} [options]
 * @returns {(import('./uploadGroups.js').UploadGroup & { visible: any[] })[]}
 */
export function filterUploadGroups(groups, query, { dateField = 'uploadedAt' } = {}) {
  const terms = normalizeHebrew(query?.q || '').split(' ').filter(Boolean)
  const statuses = query?.status?.length ? new Set(query.status) : null
  const users = query?.user?.length ? new Set(query.user) : null
  const type = query?.type || ''
  const out = []
  for (const group of groups || []) {
    const groupText = terms.length > 0 ? group.searchText ?? normalizeHebrew(`${group.title} ${group.location || ''}`) : ''
    // כל מילות החיפוש כבר בשם הספר — כל ההעלאות שבו מתאימות לחיפוש
    const pending = terms.filter((term) => !groupText.includes(term))
    const visible = group.uploads.filter((upload) => {
      if (type && (upload.uploadType || 'single_page') !== type) return false
      if (statuses && !statuses.has(upload.bookStatus || 'not_checked')) return false
      if (users && !users.has(uploaderKey(upload))) return false
      if (pending.length > 0) {
        const text = uploadSearchText(upload)
        if (!pending.every((term) => text.includes(term))) return false
      }
      return true
    })
    if (visible.length === 0) continue
    if (visible.length === group.uploads.length) {
      out.push({ ...group, visible })
    } else {
      out.push({ ...group, visible, latest: dateOf(visible[0], dateField), earliest: dateOf(visible[visible.length - 1], dateField) })
    }
  }
  return out
}

const dateOf = (upload, field) => {
  const t = new Date(upload?.[field] ?? 0).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * מיון הקבוצות: newest — לפי ההעלאה האחרונה (החדשים קודם); oldest — מי שמחכה הכי הרבה זמן
 * קודם (לפי ההעלאה הוותיקה ביותר שמוצגת); name — לפי שם הספר.
 * @template {{ latest: number, earliest: number, title: string, key: string }} G
 * @param {G[]} groups
 * @param {string} sort
 * @returns {G[]}
 */
export function sortUploadGroups(groups, sort) {
  const list = [...(groups || [])]
  const byKey = (a, b) => a.key.localeCompare(b.key, 'he')
  if (sort === 'oldest') return list.sort((a, b) => a.earliest - b.earliest || byKey(a, b))
  if (sort === 'name') return list.sort((a, b) => a.title.localeCompare(b.title, 'he') || byKey(a, b))
  return list.sort((a, b) => b.latest - a.latest || byKey(a, b))
}

/**
 * עימוד בצד הלקוח, בגודל העמוד של מסך ההעלאות (המימוש — adminList/paginate.js).
 * @template T
 * @param {T[]} items
 * @param {number} page
 * @param {number} [size]
 */
export function paginate(items, page, size = GROUPS_PER_PAGE) {
  return paginateList(items, page, size)
}

/**
 * אפשרויות הסינון לפי משתמש, עם מספר ההעלאות של כל אחד — לפי השם (א"ב: ברשימה של עשרות מעלים
 * מחפשים שם, לא דירוג), ובשם זהה — מי שהעלה יותר קודם. hint — הדואר, לחיפוש בבורר.
 * @param {any[]} uploads
 * @returns {{ value: string, label: string, count: number, hint?: string }[]}
 */
export function uploaderOptions(uploads) {
  const map = new Map()
  for (const upload of uploads || []) {
    const value = uploaderKey(upload)
    const entry = map.get(value)
    if (entry) entry.count += 1
    else map.set(value, { value, label: upload?.uploadedBy || 'אורח', count: 1, ...(upload?.uploadedByEmail ? { hint: upload.uploadedByEmail } : {}) })
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'he') || b.count - a.count)
}

/**
 * כמה העלאות יש בכל מצב ספר (bookStatus) — למונים באפשרויות הסינון.
 * @param {any[]} uploads
 * @returns {Map<string, number>}
 */
export function countByBookStatus(uploads) {
  const counts = new Map()
  for (const upload of uploads || []) {
    const key = upload?.bookStatus || 'not_checked'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

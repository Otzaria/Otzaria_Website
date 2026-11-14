// "משתמשים" (/library/admin/users) — החיפוש, הסינון, המיון, העמוד והמגירה הפתוחה: מהכתובת ואליה, ובחירת
// המשתמשים שמוצגים. לוגיקה טהורה, בלי React ובלי DOM (נבדק ב-usersQuery.test.mjs).
//
// הרשימה מגיעה כולה מהשרת (page.jsx, ואחרי פעולה GET /api/admin/users — אותה שאילתה), והסינון בצד הלקוח.

import { paginate as paginateList } from '../adminList/paginate.js'
import { formatNumber } from '../adminTerms.js'
import { getRoles } from '../roles.js'
import { ROLE_IDS, TEAMS, TEAM_IDS, roleLabel, userHasRole } from './userTerms.js'

export const USERS_PER_PAGE = 25
export const USER_SORTS = ['newest', 'oldest', 'name', 'points', 'pages']
export const SORT_LABELS = { newest: 'הצטרפו לאחרונה', oldest: 'הצטרפו ראשונים', name: 'לפי שם', points: 'הכי הרבה נקודות', pages: 'הכי הרבה עמודים' }
const DEFAULT_SORT = 'newest'
const PARAM_ORDER = ['q', 'role', 'team', 'sort', 'page', 'user']

/** @typedef {{ q: string, role: string, team: string, sort: string, page: number, user: string }} UsersQuery */

function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {UsersQuery}
 */
export function parseUsersQuery(params) {
  const get = reader(params)
  const role = get('role')
  const team = get('team')
  const sort = get('sort')
  const page = Number.parseInt(get('page'), 10)
  return {
    q: get('q').slice(0, 100),
    role: ROLE_IDS.includes(role) ? role : '',
    team: TEAM_IDS.includes(team) ? team : '',
    sort: USER_SORTS.includes(sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    user: /^[A-Za-z0-9_-]{1,64}$/.test(get('user')) ? get('user') : '',
  }
}

/** הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע; "" כשאין כלום */
export function serializeUsersQuery(query) {
  const params = new URLSearchParams()
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (value === undefined || value === null || value === '') continue
    if (name === 'sort' && value === DEFAULT_SORT) continue
    if (name === 'page' && Number(value) <= 1) continue
    params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** שינוי בחיפוש / בסינון / במיון — חוזרים לעמוד הראשון (חוץ משינוי העמוד עצמו או פתיחת מגירה) */
export function updateUsersQuery(query, patch) {
  const keepPage = 'page' in patch || ('user' in patch && Object.keys(patch).length === 1)
  return { ...query, ...patch, page: keepPage ? (patch.page ?? query.page) : 1 }
}

export function activeFilterCount(query) {
  return [query.q, query.role, query.team].filter(Boolean).length
}

export function clearFilters(query) {
  return { ...query, q: '', role: '', team: '', page: 1 }
}

/** טקסט לחיפוש: שם ודואר, באותיות קטנות */
const searchText = (user) => `${user?.name || ''} ${user?.email || ''}`.toLowerCase()

const time = (value) => {
  const ms = new Date(value ?? NaN).getTime()
  return Number.isFinite(ms) ? ms : 0
}

const COMPARE = {
  newest: (a, b) => time(b.createdAt) - time(a.createdAt),
  oldest: (a, b) => time(a.createdAt) - time(b.createdAt),
  name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'),
  points: (a, b) => (Number(b.points) || 0) - (Number(a.points) || 0),
  pages: (a, b) => (Number(b.completedPages) || 0) - (Number(a.completedPages) || 0),
}

/**
 * המשתמשים שמתאימים לחיפוש ולסינון, בסדר המיון. החיפוש — כל המילים, בשם או בדואר.
 * סינון לפי תפקיד — מי שיש לו אותו (גם כאחד מכמה תפקידים); "משתמש" — מי שאין לו אף תפקיד מוכר.
 * @param {any[]} users
 * @param {UsersQuery} query
 */
export function filterUsers(users, query) {
  const words = String(query.q || '').toLowerCase().split(/\s+/).filter(Boolean)
  const team = query.team ? TEAMS.find((t) => t.id === query.team) : null
  const out = (users || []).filter((u) => {
    if (query.role && !userHasRole(u, query.role)) return false
    if (team && u[team.field] !== true) return false
    if (words.length) {
      const text = searchText(u)
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
  const compare = COMPARE[query.sort] || COMPARE[DEFAULT_SORT]
  // יציב: בשוויון — מי שהצטרף לאחרונה קודם
  return out.sort((a, b) => compare(a, b) || COMPARE.newest(a, b))
}

/**
 * אפשרויות הבוררים, עם מספר המשתמשים בכל אחת. תפקיד — בסדר הקבוע (ROLE_LABELS); תפקיד בלי אף משתמש
 * נשאר ברשימה (עם 0), כדי שהבורר לא ישתנה מיום ליום.
 * @param {any[]} users
 */
export function filterOptions(users) {
  const roleCounts = new Map(ROLE_IDS.map((role) => [role, 0]))
  const teamCounts = new Map(TEAMS.map((team) => [team.id, 0]))
  // מעבר יחיד: מנרמלים כל משתמש פעם אחת וסופרים אותו בכל תפקידיו, בלי מערכי filter זמניים.
  for (const user of users || []) {
    const assigned = getRoles(user)
    if (assigned.length === 0) roleCounts.set('user', roleCounts.get('user') + 1)
    for (const role of assigned) roleCounts.set(role, roleCounts.get(role) + 1)
    for (const team of TEAMS) {
      if (user[team.field] === true) teamCounts.set(team.id, teamCounts.get(team.id) + 1)
    }
  }
  const roles = ROLE_IDS.map((role) => ({ value: role, label: roleLabel(role), count: roleCounts.get(role) }))
  const teams = TEAMS.map((t) => ({ value: t.id, label: t.label, count: teamCounts.get(t.id) }))
  return { roles, teams }
}

/** מה מסונן, במילים: "מנהל ספרים · מפקח · "כהן"" */
export function filterSummary(query) {
  const parts = []
  if (query.q) parts.push(`"${query.q}"`)
  if (query.role) parts.push(roleLabel(query.role))
  if (query.team) parts.push(TEAMS.find((t) => t.id === query.team)?.label)
  return parts.filter(Boolean)
}

export function paginate(items, page, size = USERS_PER_PAGE) {
  return paginateList(items, page, size)
}

/** "משתמש אחד" / "58 משתמשים" */
export function usersCountText(n) {
  return n === 1 ? 'משתמש אחד' : `${formatNumber(n)} משתמשים`
}

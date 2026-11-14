// "משתמשים" (/library/admin/users) ומגירת המשתמש — ניסוח, צוותים וחסימה, תפקידים וגופי הבקשות. לוגיקה טהורה,
// בלי React ובלי DOM (נבדק ב-userTerms.test.mjs).
//
// הצוותים והחסימה הם דגלים על המשתמש. כל אחד נשמר דרך נקודת הקצה שמנהלת אותו היום (בלי שינוי בחוזה):
//   מפקח, חסום מעריכה — PUT /api/admin/users (כמו בטבלה הקודמת במסך הזה)
//   מתנדב תיקונים     — POST /api/corrections/admin/volunteers (כמו במסך הניהול של דיווחי הטעויות)
//
// תפקידים: למשתמש יכולים להיות כמה תפקידים יחד (roles.js — roles הוא מקור האמת, role הוא הראשי). הטופס
// עובד עם מערך (form.roles), ומה שהמשתמש רואה בניהול הוא האיחוד של כל התפקידים שנבחרו.
//
// מתי שינוי נכנס לתוקף (נבדק בקוד ה-auth, api/auth/[...nextauth]/route.js: jwt): התפקידים ודגלי הצוות נשמרים
// בחיבור של המשתמש ומתרעננים רק כשהוא מתחבר מחדש — ולכן הסרגל ומסכי הניהול מתעדכנים אצלו רק אז. מה שנבדק
// מול המסד בכל בקשה (החסימה, אישור הצעות של מפקח, טיפול בדיווח של מתנדב) — חל מיד.

import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLES, getRoles, normalizeRoles, primaryRole } from '../roles.js'
import { buildAdminNavGroups, visibleNavItems } from '../adminNav.js'
import { formatNumber } from '../adminTerms.js'

/** @typedef {'supervisor' | 'volunteer' | 'blocked'} FlagId */

/**
 * הדגלים, בסדר התצוגה. kind — צוות (מפקח, מתנדב תיקונים) או הגבלה (חסום מעריכה), שמוצגת בנפרד.
 * field — הדגל על המשתמש; via — איזו נקודת קצה שומרת אותו.
 * @type {{ id: FlagId, kind: 'team' | 'restriction', field: string, label: string, description: string,
 *   tone: 'neutral' | 'error', via: 'users' | 'volunteers' }[]}
 */
export const TEAMS = [
  {
    id: 'supervisor', kind: 'team', field: 'isSupervisor', label: 'מפקח', tone: 'neutral', via: 'users',
    description: 'במרחב עריכת הספרים: עורך את הטקסט ישירות ומאשר הצעות של אחרים.',
  },
  {
    id: 'volunteer', kind: 'team', field: 'isCorrectionsVolunteer', label: 'מתנדב תיקונים', tone: 'neutral', via: 'volunteers',
    description: 'מטפל בדיווחי טעויות ומאשר תיקונים.',
  },
  {
    id: 'blocked', kind: 'restriction', field: 'dictaEditBlocked', label: 'חסום מעריכה', tone: 'error', via: 'users',
    description: 'במרחב עריכת הספרים: לא יכול להגיש שינויים בטקסט. עבודה על עמודים לא נפגעת.',
  },
]

export const TEAM_IDS = TEAMS.map((t) => t.id)
/** הצוותים בלבד (בלי החסימה) */
export const TEAM_FLAGS = TEAMS.filter((t) => t.kind === 'team')
/** ההגבלות (חסום מעריכה) */
export const RESTRICTIONS = TEAMS.filter((t) => t.kind === 'restriction')
export const BLOCKED = RESTRICTIONS[0]

/** הדגלים שהמשתמש בהם (דגל שהוא true ממש) */
export function userTeams(user) {
  return TEAMS.filter((t) => user?.[t.field] === true)
}

/**
 * ההסבר מתחת למתג. מפקח שגם חסום — החסימה גוברת (השרת חוסם כל הגשה), וזה נאמר.
 * @param {(typeof TEAMS)[number]} team
 * @param {{ blocked?: boolean }} [state]  blocked — מתג החסימה דלוק (כולל שינוי שעוד ממתין)
 */
export function teamDescription(team, { blocked = false } = {}) {
  if (team.id === 'supervisor' && blocked) return `${team.description} לא פעיל כל עוד הוא חסום.`
  return team.description
}

/** הסיבה הקבועה שהשרת כותב בחסימה מהמסך הזה — היא לא סיבה, ולכן לא מוצגת כ"הסיבה:" */
const GENERIC_BLOCK_REASON = 'נחסם דרך ממשק ניהול המשתמשים'

/** סיבת החסימה שנרשמה (מהצעות העריכה, למשל), או '' כשאין סיבה של ממש */
export function blockReason(user) {
  if (user?.dictaEditBlocked !== true) return ''
  const reason = String(user.dictaEditBlockedReason || '').trim()
  return reason === GENERIC_BLOCK_REASON ? '' : reason
}

/** התפקידים לבורר הסינון, בסדר של ROLE_LABELS (כולל "משתמש" — מי שאין לו אף תפקיד) */
export const ROLE_IDS = Object.keys(ROLE_LABELS)

/** התפקידים שאפשר להעניק במגירה (בלי "משתמש", שהוא היעדר תפקיד), בסדר העדיפות של roles.js */
export const ASSIGNABLE_ROLE_IDS = ASSIGNABLE_ROLES

/** שם התפקיד; תפקיד לא מוכר (או חסר) — "משתמש", כמו בטבלה הקודמת */
export function roleLabel(role) {
  return ROLE_LABELS[role] || ROLE_LABELS.user
}

/** תפקיד מוכר, או "user" */
export const roleOf = (role) => (ROLE_LABELS[role] ? role : 'user')

/** כל התפקידים של המשתמש (role + roles; roles.js) — ריק: משתמש רגיל */
export const userRoles = (user) => getRoles(user)

/** האם למשתמש יש את התפקיד (לסינון). "user" — מי שאין לו אף תפקיד */
export function userHasRole(user, role) {
  const roles = getRoles(user)
  return role === 'user' ? roles.length === 0 : roles.includes(role)
}

/** רשימה בעברית: "א", "א וב", "א, ב וג" */
function hebrewList(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`
}

/** שם של כמה תפקידים יחד: "מנהל ספרים ומנהל OCR"; בלי תפקיד — "משתמש" */
export function rolesLabel(roles) {
  const list = getRoles(roles)
  return list.length === 0 ? ROLE_LABELS.user : hebrewList(list.map(roleLabel))
}

/** אותם תפקידים (בלי תלות בסדר ובכפילויות) */
export function sameRoles(a, b) {
  const x = normalizeRoles(a)
  const y = normalizeRoles(b)
  return x.length === y.length && x.every((r, i) => r === y[i])
}

/**
 * בחירת תפקיד במגירה (סימון / ביטול סימון). מנהל כללי כולל את כל השאר — כשהוא מסומן, הוא לבדו.
 * @param {string[]} roles  הבחירה הנוכחית
 * @param {string} role
 * @param {boolean} on
 */
export function toggleRole(roles, role, on) {
  const rest = getRoles(roles).filter((r) => r !== role)
  return normalizeRoles(on ? [...rest, role] : rest)
}

/**
 * שורת ההסבר של כל תפקיד בבורר — מה רואים בניהול (תואם ל-adminNav; נבדק בטסט שלכל תפקיד יש הסבר).
 * @type {Record<string, string>}
 */
export const ROLE_HINTS = {
  user: 'בלי ממשק ניהול.',
  admin: 'הכול, כולל משתמשים ותוספים.',
  admin_plugins: 'תוספים והודעות.',
  admin_books: 'ספרים, העלאות, עמודים, דיווחי טעויות והצעות עריכה.',
  admin_books_only: 'רשימת הספרים בלבד, בלי העלאות, עמודים ודיווחים.',
  admin_ocr: 'עמודים לאימון, תמלול שורות, תיוג מבנה והגהה.',
  model_trainer: 'כמו מנהל OCR, ועוד משוב החיפוש.',
  developer: 'דיווחי התקלות מהאפליקציה בלבד.',
}

/** אפשרויות הבורר: שם, ומתחתיו מה התפקיד רואה */
export const ROLE_OPTIONS = ROLE_IDS.map((role) => ({ value: role, label: roleLabel(role), description: ROLE_HINTS[role] }))

/** גוון התג: מנהל כללי בולט; כל תפקיד אחר — ניטרלי (בלי צבעי מצב, שאומרים "חדש" / "ממתין") */
export function roleTone(role) {
  return role === 'admin' ? 'primary' : 'neutral'
}

/** משתמש רגיל — בלי תג (זו ברירת המחדל; תג בכל שורה הוא רעש) */
export function showsRoleTag(role) {
  return roleOf(role) !== 'user'
}

/** יש למשתמש שם (השדה חובה, אבל יש חשבונות ישנים בלי) */
export function hasName(user) {
  return String(user?.name || '').trim() !== ''
}

/** שם לתצוגה — ומשתמש בלי שם — הדואר */
export function displayName(user) {
  return String(user?.name || '').trim() || String(user?.email || '').trim() || 'משתמש בלי שם'
}

const navLabel = (item) => (item.id === 'dashboard' ? 'לוח הניהול' : item.label)

/**
 * מה התפקיד (או צירוף התפקידים) רואה בניהול — מתוך הסרגל עצמו (buildAdminNavGroups), לפי התפקידים בלבד: צוות
 * (מפקח, מתנדב תיקונים) לא משתנה בשינוי תפקיד, ולכן לא נכנס להסבר. שורה לכל קבוצה: "ספרים: ספרים, העלאות".
 * @param {string | string[]} roles
 * @returns {string[]} ריק — לא יראה את ממשק הניהול בכלל
 */
export function roleAccessLines(roles) {
  return buildAdminNavGroups(getRoles(roles)).map((g) => {
    const names = g.items.map(navLabel).join(', ')
    return g.label ? `${g.label}: ${names}` : names
  })
}

/** מה שהתפקידים הקודמים ראו והחדשים לא יראו — שמות המסכים, בסדר הסרגל (תפקיד או מערך תפקידים) */
export function roleLostItems(fromRoles, toRoles) {
  const next = new Set(visibleNavItems(getRoles(toRoles)).map((i) => i.id))
  return visibleNavItems(getRoles(fromRoles)).filter((i) => !next.has(i.id)).map(navLabel)
}

/**
 * חלון האישור של שינוי תפקידים: מה יראה (האיחוד של כל התפקידים שנבחרו), מה ייעלם, ומתי זה נכנס לתוקף.
 * self — המנהל משנה את התפקידים של עצמו: גוף שני, ואזהרה כשהוא מאבד את "משתמשים" (הדרך לחזור).
 * roles — הבחירה החדשה (מערך; מחרוזת של תפקיד אחד מתקבלת גם היא).
 * @param {{ user: any, roles: string[] | string, self?: boolean }} input
 */
export function roleChangeConfirm({ user, roles, self = false }) {
  const next = normalizeRoles(roles)
  const name = displayName(user)
  const label = rolesLabel(next)
  const many = next.length > 1
  const lines = roleAccessLines(next)
  const lost = roleLostItems(getRoles(user), next)
  const losesUsers = self && !next.includes(ROLES.ADMIN)
  let intro
  if (self) intro = lines.length > 0 ? `אתה תהיה ${label}. בניהול תראה:` : `אתה תהיה ${label}, ולא תראה את ממשק הניהול.`
  else intro = lines.length > 0 ? `${name} יהיה ${label}. בניהול הוא יראה:` : `${name} יהיה ${label}, ולא יראה את ממשק הניהול.`
  return {
    title: many ? `לשנות את התפקידים ל${label}?` : `לשנות את התפקיד ל${label}?`,
    body: intro,
    details: lines,
    lost: lost.length > 0 ? `${self ? 'לא תראה יותר' : 'לא יראה יותר'}: ${lost.join(', ')}.` : '',
    note: self ? 'השינוי ייכנס לתוקף במלואו כשתתחבר מחדש.' : 'השינוי ייכנס לתוקף במלואו כשהוא יתחבר מחדש.',
    warning: losesUsers ? 'זה החשבון שלך. אחרי שתתחבר מחדש לא תוכל להיכנס למסך הזה ולהחזיר את התפקיד.' : '',
    confirmLabel: many ? 'שנה תפקידים' : 'שנה תפקיד',
    tone: losesUsers ? 'danger' : 'default',
  }
}

/** ההודעה אחרי שמירה: שינוי תפקידים — נאמר במפורש. roles — התפקידים החדשים (מערך) */
export function savedToast(name, changes, roles) {
  const others = changes.name || changes.email || changes.points
  const next = normalizeRoles(roles)
  if (changes.roles && !others) {
    return next.length > 1 ? `התפקידים של ${name} שונו ל${rolesLabel(next)}` : `התפקיד של ${name} שונה ל${rolesLabel(next)}`
  }
  if (changes.roles) return `הפרטים והתפקיד של ${name} נשמרו`
  return `הפרטים של ${name} נשמרו`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * בדיקת טופס הפרטים — אותם כללים כמו בשרת (דואר תקין עד 254 תווים), ושם לא ריק ונקודות במספר שלם.
 * changes — רק השדות ששונו נבדקים: ערך ישן חריג (משתמש בלי שם, נקודות ענקיות) לא חוסם שמירה של שדה אחר.
 * @param {{ name: string, email: string, points: string | number }} form
 * @param {{ name?: boolean, email?: boolean, points?: boolean }} [changes]  בלי — הכול נבדק
 * @returns {{ name?: string, email?: string, points?: string }}
 */
export function validateDetails(form, changes) {
  const check = (field) => !changes || changes[field] === true
  const errors = {}
  if (check('name') && !String(form?.name ?? '').trim()) errors.name = 'כתוב שם.'
  const email = String(form?.email ?? '').trim()
  if (check('email')) {
    if (!email) errors.email = 'כתוב כתובת דואר.'
    else if (email.length > 254 || !EMAIL.test(email)) errors.email = 'כתובת הדואר לא תקינה.'
  }
  const points = String(form?.points ?? '').trim()
  if (check('points') && !(/^-?\d+$/.test(points) && Number.isSafeInteger(Number(points)))) errors.points = 'כתוב מספר שלם.'
  return errors
}

/** הנקודות כטקסט לשדה — גם מספר גדול מאוד בלי "1e+21" */
function pointsText(points) {
  const n = Number(points)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 })
}

/** הטופס מתוך המשתמש השמור */
export function detailsForm(user) {
  return {
    name: String(user?.name ?? ''),
    email: String(user?.email ?? ''),
    points: pointsText(user?.points),
    roles: getRoles(user),
  }
}

/** מה השתנה בטופס מול השמור: { name, email, points, roles } — true לכל שדה ששונה */
export function detailsChanges(user, form) {
  const saved = detailsForm(user)
  return {
    name: String(form.name).trim() !== saved.name.trim(),
    email: String(form.email).trim() !== saved.email.trim(),
    points: String(form.points).trim() !== saved.points,
    roles: !sameRoles(form.roles, saved.roles),
  }
}

export const hasChanges = (changes) => Object.values(changes).some(Boolean)

/**
 * השדות שהשרת כותב תמיד מהגוף (api/admin/users, PUT: roles, points, name), והדואר — כמו שהם שמורים, בלי
 * קיצוץ ובלי "תיקון": בקשה שלא נוגעת בהם לא משנה אותם. שדה חסר (undefined) לא נשלח ב-JSON, ו-Mongoose לא
 * נוגע בו. התפקידים נשלחים כמערך (roles); השרת גוזר מהם את role (הראשי).
 */
const savedFields = (user) => ({ userId: user._id, name: user.name, email: user.email, roles: getRoles(user), points: user.points })

/**
 * גוף ה-PUT של "שמור": השדות ששונו — מהטופס (מקוצצים), והשאר — מהשמור העדכני כמו שהוא.
 * dictaEditBlocked ו-isSupervisor לא נשלחים: שליחת dictaEditBlocked כותבת מחדש את סיבת החסימה ואת מי חסם.
 * @param {any} user  המשתמש השמור, ברגע שהבקשה יוצאת
 * @param {{ name: string, email: string, points: string | number, roles: string[] }} form
 * @param {{ name: boolean, email: boolean, points: boolean, roles: boolean }} changes
 */
export function detailsBody(user, form, changes) {
  const body = savedFields(user)
  if (changes.name) body.name = String(form.name).trim()
  if (changes.email) body.email = String(form.email).trim()
  if (changes.points) body.points = Number(String(form.points).trim())
  if (changes.roles) body.roles = normalizeRoles(form.roles)
  return body
}

/**
 * גוף ה-PUT של מתג (מפקח / חסום מעריכה): הערכים השמורים העדכניים כמו שהם, ועוד הדגל.
 * @param {any} user  המשתמש השמור, ברגע שהבקשה יוצאת
 * @param {'isSupervisor' | 'dictaEditBlocked'} field
 * @param {boolean} value
 */
export function flagBody(user, field, value) {
  return { ...savedFields(user), [field]: value }
}

/** מה השרת החזיר ושכדאי לקחת ממנו (התשובה לא כוללת את המונים) */
const SERVER_FIELDS = ['isVerified', 'dictaEditBlockedReason', 'dictaEditBlockedAt', 'updatedAt']
function fromServer(server) {
  const out = {}
  if (server && typeof server === 'object') for (const key of SERVER_FIELDS) if (key in server) out[key] = server[key]
  return out
}

/**
 * השינוי המקומי אחרי "שמור" — רק השדות ששונו (ומה שהשרת קבע: אימות הדואר), לא כל המשתמש: מיזוג של
 * משתמש שלם היה מחזיר דגל שנשמר בינתיים (מתג) לערך הישן.
 */
export function detailsPatch(body, changes, server) {
  const patch = { _id: body.userId, ...fromServer(server) }
  for (const field of ['name', 'email', 'points']) if (changes[field]) patch[field] = body[field]
  // התפקידים — גם role (הראשי), כמו שהשרת כותב: getRoles מאחד את שניהם, ו-role ישן היה נשאר בתוקף
  if (changes.roles) Object.assign(patch, { roles: body.roles, role: primaryRole(body.roles) })
  return patch
}

/** השינוי המקומי אחרי מתג — הדגל, ובחסימה גם הסיבה והתאריך שהשרת כתב (או מחק) */
export function flagPatch(userId, team, value, server) {
  const patch = { _id: userId, [team.field]: value }
  if (team.id === 'blocked') {
    const s = fromServer(server)
    patch.dictaEditBlockedReason = 'dictaEditBlockedReason' in s ? s.dictaEditBlockedReason : ''
    patch.dictaEditBlockedAt = 'dictaEditBlockedAt' in s ? s.dictaEditBlockedAt : null
  }
  return patch
}

/** אישור מחיקה: הדואר שהוקלד זהה לדואר של המשתמש (בלי רווחים בקצוות, בלי הבדל אותיות גדולות) */
export function deleteConfirmed(typed, email) {
  const a = String(typed ?? '').trim().toLowerCase()
  const b = String(email ?? '').trim().toLowerCase()
  return a !== '' && a === b
}

/** המונים בשורה ובמגירה */
export function activityCounts(user) {
  return {
    points: Number(user?.points) || 0,
    completed: Number(user?.completedPages) || 0,
    inProgress: Number(user?.inProgressPages) || 0,
  }
}

const pagesText = (n) => (n === 1 ? 'עמוד אחד' : `${formatNumber(n)} עמודים`)

/**
 * מה המחיקה עושה לעמודים, במספרים שכבר יש ברשימה (api/admin/users, DELETE: כל עמוד שמשויך אליו חוזר להיות
 * פנוי, וגם "הושלם" נמחק ממנו).
 * @returns {string[]}
 */
export function deleteImpact(user) {
  const { completed, inProgress } = activityCounts(user)
  const total = Math.max(Number(user?.totalPages) || 0, completed + inProgress)
  if (total === 0) return ['אין לו עמודים, כך שהספרים לא יושפעו.']
  let pages
  if (completed > 0 && inProgress > 0) pages = `${pagesText(completed)} שהושלמו ועוד ${pagesText(inProgress)} בעבודה יחזרו להיות פנויים.`
  else if (completed > 0) pages = `${pagesText(completed)} שהושלמו יחזרו להיות פנויים.`
  else pages = `${pagesText(total)} שלו יחזרו להיות פנויים.`
  const lines = [pages]
  if (completed > 0) lines.push('ההתקדמות של הספרים שלהם תרד בהתאם, ומישהו יצטרך לעבור עליהם שוב.')
  return lines
}

/** ההודעה אחרי מתג */
export function teamToast(team, on, name) {
  if (team.id === 'blocked') return on ? `${name} נחסם מעריכה` : `החסימה של ${name} בוטלה`
  return on ? `${name} נוסף לצוות "${team.label}"` : `${name} הוסר מהצוות "${team.label}"`
}

/** ההודעה בזמן ההמתנה ל"בטל" (לפני שהשינוי נשלח) */
export function teamPendingText(team, on, name) {
  if (team.id === 'blocked') return on ? `${name} ייחסם מעריכה` : `החסימה של ${name} תבוטל`
  return on ? `${name} יתווסף לצוות "${team.label}"` : `${name} יוסר מהצוות "${team.label}"`
}

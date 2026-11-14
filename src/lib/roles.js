export const ROLES = {
  ADMIN: 'admin',
  ADMIN_PLUGINS: 'admin_plugins',
  ADMIN_BOOKS: 'admin_books',
  // מנהל ספרים-בלבד: גישה מלאה לספריית הספרים (/library/books) ולניהול המקביל
  // (/library/admin/books) בלבד — ללא העלאות, עמודים או כל מודול אחר.
  ADMIN_BOOKS_ONLY: 'admin_books_only',
  // מנהל OCR: גישה לניהול שלושת אזורי ה-OCR בלבד — מאגר אימון, תמלול שורות
  // ותיוג מבנה עמוד (/library/admin/ocr-*) — ללא שאר מודולי הניהול.
  ADMIN_OCR: 'admin_ocr',
  // מאמן מודלים: כל מה שמנהל OCR רואה, ובנוסף משוב החיפוש הסמנטי (/library/admin/search-feedback).
  MODEL_TRAINER: 'model_trainer',
  // מפתח: דיווחי התוכנה בלבד (/library/admin/app-reports). בכוונה לא ב-ALL_ADMIN_ROLES.
  DEVELOPER: 'developer',
}

export const ROLE_LABELS = {
  user: 'משתמש',
  admin: 'מנהל כללי',
  admin_plugins: 'מנהל תוספים',
  admin_books: 'מנהל ספרים',
  admin_books_only: 'מנהל ספרים בלבד',
  admin_ocr: 'מנהל OCR',
  model_trainer: 'מאמן מודלים',
  developer: 'מפתח',
}

export const ALL_ADMIN_ROLES = [ROLES.ADMIN, ROLES.ADMIN_PLUGINS, ROLES.ADMIN_BOOKS, ROLES.ADMIN_BOOKS_ONLY, ROLES.ADMIN_OCR, ROLES.MODEL_TRAINER]

// ===== תפקידים מרובים =====
// משתמש יכול להחזיק כמה תפקידים יחד (למשל מנהל OCR + מנהל ספרים). מקור האמת הוא השדה
// roles (מערך) במסמך המשתמש; השדה role נשמר כ"תפקיד ראשי" (primaryRole) — לתאימות לאחור
// עם רשומות ישנות, עם JWT של משתמשים שכבר מחוברים, ועם צרכנים שקוראים role בלבד.
// משתמש ישן שאין לו roles — התפקידים שלו הם [role] (getRoles מאחד את שני השדות).
//
// כל פונקציות ההרשאה כאן מקבלות "נושא" (subject) באחת מהצורות:
//   מחרוזת תפקיד ('admin_ocr') | מערך תפקידים (['admin_ocr', 'admin_books']) |
//   אובייקט משתמש / session.user / טוקן ({ role, roles, ...דגלים }).
// הגישה היא איחוד: מספיק שאחד התפקידים מתיר. לכן בודקים תמיד דרך העוזרים כאן, ולא
// בהשוואה ישירה `user.role === '...'` — השוואה כזו רואה רק את התפקיד הראשי.

/** כל התפקידים שניתן להעניק (בלי 'user', שהוא היעדר תפקיד), בסדר עדיפות: הראשון שקיים הוא הראשי */
export const ASSIGNABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.ADMIN_BOOKS,
  ROLES.ADMIN_BOOKS_ONLY,
  ROLES.ADMIN_PLUGINS,
  ROLES.ADMIN_OCR,
  ROLES.MODEL_TRAINER,
  ROLES.DEVELOPER,
]

/** הערכים המותרים בשדה role של המודל (כולל 'user') */
export const ROLE_ENUM = ['user', ...ASSIGNABLE_ROLES]

const ASSIGNABLE = new Set(ASSIGNABLE_ROLES)
const byPriority = (a, b) => ASSIGNABLE_ROLES.indexOf(a) - ASSIGNABLE_ROLES.indexOf(b)

/**
 * התפקידים של הנושא — מערך ממוין לפי עדיפות, בלי כפילויות, בלי 'user' ובלי ערכים לא מוכרים.
 * משתמש רגיל (או אורח) — מערך ריק.
 * @param {string | string[] | { role?: string | null, roles?: string[] | null } | null | undefined} subject
 * @returns {string[]}
 */
export function getRoles(subject) {
  if (!subject) return []
  let list
  if (typeof subject === 'string') list = [subject]
  else if (Array.isArray(subject)) list = subject
  else list = [...(Array.isArray(subject.roles) ? subject.roles : []), subject.role]
  return [...new Set(list.filter((r) => ASSIGNABLE.has(r)))].sort(byPriority)
}

/** האם לנושא יש לפחות אחד מהתפקידים הנתונים */
export function hasRole(subject, ...roles) {
  return getRoles(subject).some((r) => roles.includes(r))
}

/**
 * ניקוי רשימת תפקידים לפני שמירה: רק ערכים מוכרים, בלי כפילויות, בסדר עדיפות. מנהל כללי
 * כולל ממילא את כל השאר — לכן כשהוא נבחר הוא נשמר לבדו.
 * @param {unknown} input
 * @returns {string[]}
 */
export function normalizeRoles(input) {
  const roles = getRoles(Array.isArray(input) ? input : typeof input === 'string' ? [input] : [])
  return roles.includes(ROLES.ADMIN) ? [ROLES.ADMIN] : roles
}

/** התפקיד הראשי (השדה role במודל) — בעל העדיפות הגבוהה, או 'user' כשאין תפקיד */
export function primaryRole(subject) {
  return getRoles(subject)[0] || 'user'
}

/**
 * שאילתת Mongo למשתמשים שיש להם לפחות אחד מהתפקידים — בודקת גם את roles וגם את role
 * (רשומות ישנות שאין להן roles).
 * @param {string[]} roles
 */
export function roleQuery(roles) {
  return { $or: [{ role: { $in: roles } }, { roles: { $in: roles } }] }
}

/** שאילתת Mongo למשתמשים שאין להם אף אחד מהתפקידים (ההפך של roleQuery) */
export function notRoleQuery(roles) {
  return { role: { $nin: roles }, roles: { $nin: roles } }
}

/** גישה לכל מה שבניהול */
export function isAdmin(subject) {
  return hasRole(subject, ROLES.ADMIN)
}

/** גישה לניהול תוספים */
export function hasPluginsAccess(subject) {
  return hasRole(subject, ROLES.ADMIN, ROLES.ADMIN_PLUGINS)
}

/** גישה לניהול ספרים הרחב (הכל חוץ ממשתמשים ותוספים) — כולל העלאות, עמודים וכו'.
 *  שים לב: מנהל-ספרים-בלבד אינו נכלל כאן בכוונה, כדי שלא יקבל גישה להעלאות/עמודים. */
export function hasBooksAccess(subject) {
  return hasRole(subject, ROLES.ADMIN, ROLES.ADMIN_BOOKS)
}

/** ניהול צורת הדף (/library/admin/tzurat-hadaf, /api/admin/tzurat-hadaf) — מנהל כללי ומנהל ספרים */
export function hasTzuratAdminAccess(subject) {
  return hasRole(subject, ROLES.ADMIN, ROLES.ADMIN_BOOKS)
}

/** גישה לספריית הספרים עצמה: ניהול ספרים (/library/admin/books), קטגוריות, תמלול
 *  עמודים ב-/library/books. נכלל גם מנהל-ספרים-בלבד, בנוסף למנהלי הספרים הרחבים. */
export function hasBookLibraryAccess(subject) {
  return hasRole(subject, ROLES.ADMIN, ROLES.ADMIN_BOOKS, ROLES.ADMIN_BOOKS_ONLY)
}

/** גישה לניהול שלושת אזורי ה-OCR (מאגר אימון, תמלול שורות, תיוג מבנה עמוד) */
export function hasOcrAccess(subject) {
  return hasRole(subject, ROLES.ADMIN, ROLES.ADMIN_OCR, ROLES.MODEL_TRAINER)
}

/** גישה לדיווחי התוכנה (מנהל כללי או מפתח) */
export function hasAppReportsAccess(subject) {
  return hasRole(subject, ROLES.ADMIN, ROLES.DEVELOPER)
}

/** משוב החיפוש הסמנטי (סטטיסטיקה, ייצוא, ניקוי, חסימת מפתחות) — מנהל כללי ומאמן מודלים */
export function hasSearchFeedbackAccess(subject) {
  return hasRole(subject, ROLES.ADMIN, ROLES.MODEL_TRAINER)
}

/** כל סוג מנהל */
export function hasAnyAdminAccess(subject) {
  return hasRole(subject, ...ALL_ADMIN_ROLES)
}

// ===== מרחב עריכת הספרים הערוכים =====
// המפקח אינו role בפני עצמו אלא דגל isSupervisor על המשתמש, ולכן העוזרים
// הבאים מקבלים אובייקט משתמש/סשן ולא רק את ה-role.

/** מי שעריכותיו מוחלות מיד וגם רשאי לאשר הצעות: מנהל-על, מנהל ספרים, או מפקח */
export function canEditLibraryDirectly(user) {
  if (!user) return false
  return hasRole(user, ROLES.ADMIN, ROLES.ADMIN_BOOKS) || user.isSupervisor === true
}

/** רשאי לאשר/לדחות הצעות ולחסום משתמשים (זהה לעורך-ישיר) */
export function canModerateLibrary(user) {
  return canEditLibraryDirectly(user)
}

/** רשאי לכפות סנכרון מיידי לגיטהאב ולהגדיר מפקחים — מנהלי ספרים בלבד */
export function canManageLibrarySync(user) {
  if (!user) return false
  return hasRole(user, ROLES.ADMIN, ROLES.ADMIN_BOOKS)
}

// ===== תיקוני טקסט =====
// טיפול/אישור תיקונים נפרד מניהול המערכת: מתנדב מסומן בדגל isCorrectionsVolunteer;
// מנהל כללי ומנהל ספרים מקבלים את ההרשאה אוטומטית.

/** רשאי לטפל בדיווחי תיקונים (לקחת, לאשר, לערוך, לדחות, להעביר) */
export function canHandleCorrections(user) {
  if (!user) return false
  return hasRole(user, ROLES.ADMIN, ROLES.ADMIN_BOOKS) || user.isCorrectionsVolunteer === true
}

/** רשאי לנהל את מערכת התיקונים (בריאות, השהיית השירות, מינוי מתנדבים, טיפול חיצוני) */
export function canManageCorrections(user) {
  if (!user) return false
  return hasRole(user, ROLES.ADMIN, ROLES.ADMIN_BOOKS)
}

/** הגדרות מערכת של התיקונים (מתג השירות) — מנהל כללי בלבד */
export function canConfigureCorrections(user) {
  return Boolean(user) && isAdmin(user)
}

export const ROLES = {
  ADMIN: 'admin',
  ADMIN_PLUGINS: 'admin_plugins',
  ADMIN_BOOKS: 'admin_books',
}

export const ROLE_LABELS = {
  user: 'משתמש',
  admin: 'מנהל כללי',
  admin_plugins: 'מנהל תוספים',
  admin_books: 'מנהל ספרים',
}

export const ALL_ADMIN_ROLES = [ROLES.ADMIN, ROLES.ADMIN_PLUGINS, ROLES.ADMIN_BOOKS]

/** גישה לכל מה שבניהול */
export function isAdmin(role) {
  return role === ROLES.ADMIN
}

/** גישה לניהול תוספים */
export function hasPluginsAccess(role) {
  return role === ROLES.ADMIN || role === ROLES.ADMIN_PLUGINS
}

/** גישה לניהול ספרים (הכל חוץ ממשתמשים ותוספים) */
export function hasBooksAccess(role) {
  return role === ROLES.ADMIN || role === ROLES.ADMIN_BOOKS
}

/** כל סוג מנהל */
export function hasAnyAdminAccess(role) {
  return ALL_ADMIN_ROLES.includes(role)
}

// ===== מרחב עריכת הספרים הערוכים =====
// המפקח אינו role בפני עצמו אלא דגל isSupervisor על המשתמש, ולכן העוזרים
// הבאים מקבלים אובייקט משתמש/סשן ולא רק את ה-role.

/** מי שעריכותיו מוחלות מיד וגם רשאי לאשר הצעות: מנהל-על, מנהל ספרים, או מפקח */
export function canEditLibraryDirectly(user) {
  if (!user) return false
  return user.role === ROLES.ADMIN || user.role === ROLES.ADMIN_BOOKS || user.isSupervisor === true
}

/** רשאי לאשר/לדחות הצעות ולחסום משתמשים (זהה לעורך-ישיר) */
export function canModerateLibrary(user) {
  return canEditLibraryDirectly(user)
}

/** רשאי לכפות סנכרון מיידי לגיטהאב ולהגדיר מפקחים — מנהלי ספרים בלבד */
export function canManageLibrarySync(user) {
  if (!user) return false
  return user.role === ROLES.ADMIN || user.role === ROLES.ADMIN_BOOKS
}

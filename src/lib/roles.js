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

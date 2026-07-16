export const ROLES = {
  ADMIN: 'admin',
  ADMIN_PLUGINS: 'admin_plugins',
  ADMIN_BOOKS: 'admin_books',
  // מנהל ספרים-בלבד: גישה מלאה לספריית הספרים (/library/books) ולניהול המקביל
  // (/library/admin/books) בלבד — ללא דיקטה, העלאות, עמודים או כל מודול אחר.
  ADMIN_BOOKS_ONLY: 'admin_books_only',
  // מנהל OCR: גישה לניהול שלושת אזורי ה-OCR בלבד — מאגר אימון, תמלול שורות
  // ותיוג מבנה עמוד (/library/admin/ocr-*) — ללא שאר מודולי הניהול.
  ADMIN_OCR: 'admin_ocr',
}

export const ROLE_LABELS = {
  user: 'משתמש',
  admin: 'מנהל כללי',
  admin_plugins: 'מנהל תוספים',
  admin_books: 'מנהל ספרים',
  admin_books_only: 'מנהל ספרים בלבד',
  admin_ocr: 'מנהל OCR',
}

export const ALL_ADMIN_ROLES = [ROLES.ADMIN, ROLES.ADMIN_PLUGINS, ROLES.ADMIN_BOOKS, ROLES.ADMIN_BOOKS_ONLY, ROLES.ADMIN_OCR]

/** גישה לכל מה שבניהול */
export function isAdmin(role) {
  return role === ROLES.ADMIN
}

/** גישה לניהול תוספים */
export function hasPluginsAccess(role) {
  return role === ROLES.ADMIN || role === ROLES.ADMIN_PLUGINS
}

/** גישה לניהול ספרים הרחב (הכל חוץ ממשתמשים ותוספים) — כולל דיקטה, העלאות, עמודים וכו'.
 *  שים לב: מנהל-ספרים-בלבד אינו נכלל כאן בכוונה, כדי שלא יקבל גישה לדיקטה/העלאות/עמודים. */
export function hasBooksAccess(role) {
  return role === ROLES.ADMIN || role === ROLES.ADMIN_BOOKS
}

/** גישה לספריית הספרים עצמה: ניהול ספרים (/library/admin/books), קטגוריות, תמלול
 *  עמודים ב-/library/books. נכלל גם מנהל-ספרים-בלבד, בנוסף למנהלי הספרים הרחבים. */
export function hasBookLibraryAccess(role) {
  return role === ROLES.ADMIN || role === ROLES.ADMIN_BOOKS || role === ROLES.ADMIN_BOOKS_ONLY
}

/** גישה לניהול שלושת אזורי ה-OCR (מאגר אימון, תמלול שורות, תיוג מבנה עמוד) */
export function hasOcrAccess(role) {
  return role === ROLES.ADMIN || role === ROLES.ADMIN_OCR
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

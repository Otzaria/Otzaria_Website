// אילו מוני-תג (badges) רואה כל תפקיד בפאנל הניהול — לוגיקה טהורה, בלי DB,
// כדי שתהיה ניתנת לבדיקה בנפרד (ראו adminBadgeScope.test.mjs). משמשת גם את
// ה-layout של /library/admin וגם את GET /api/badge-counts.
//
// ההרשאות זהות בדיוק למה שה-layout בדק קודם לפני כל fetch:
// - הודעות שלא נקראו: admin / admin_plugins / admin_books בלבד (כך היה
//   ה-fetch ל-/api/messages?allMessages=true מוגבל; admin_ocr ו-admin_books_only
//   לא ביצעו אותו כלל).
// - העלאות ממתינות: hasBooksAccess (admin / admin_books), כמו /api/admin/uploads/list.
// - תוספים ממתינים: hasPluginsAccess (admin / admin_plugins), כמו /api/admin/plugins.
import { ROLES, hasBooksAccess, hasPluginsAccess } from './roles.js'

const MESSAGE_BADGE_ROLES = [ROLES.ADMIN, ROLES.ADMIN_PLUGINS, ROLES.ADMIN_BOOKS]

export function adminBadgeScope(role) {
  return {
    messages: MESSAGE_BADGE_ROLES.includes(role),
    uploads: hasBooksAccess(role),
    plugins: hasPluginsAccess(role),
  }
}

/** האם לתפקיד יש מונה כלשהו לרענן (אם לא — אין טעם לתשאל כלל) */
export function hasAnyAdminBadge(role) {
  const scope = adminBadgeScope(role)
  return scope.messages || scope.uploads || scope.plugins
}

export const EMPTY_ADMIN_BADGE_COUNTS = Object.freeze({
  unreadMessages: 0,
  pendingUploads: 0,
  pendingPlugins: 0,
})

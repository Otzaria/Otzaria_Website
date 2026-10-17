import { hasAnyAdminAccess } from './roles.js'

/**
 * לוגיקה טהורה של אזור החשבון בכותרות (components/layout/AccountActions + AccountMenu):
 * כתובות, השם הנגיש והרמז של כפתור החשבון, ורשימת הקישורים בתפריט לפי תפקיד.
 */

/** כתובת ההתחברות — עם callbackUrl כשרוצים לחזור לאותו דף אחרי ההתחברות */
export function loginHref(callbackUrl) {
  return callbackUrl ? `/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/auth/login'
}

/** יעד "ניהול": מפתח — דיווחי התוכנה בלבד; מנהל (כל סוג, roles.js) — לוח הניהול; אחר — אין */
export function adminHref(role) {
  if (role === 'developer') return '/library/admin/app-reports'
  if (hasAnyAdminAccess(role)) return '/library/admin'
  return null
}

/** האות הראשונה של השם (לעיגול שבכפתור החשבון); בלי שם — אייקון במקומה (null).
 *  זה כל מה שהכפתור בכותרת מציג — השם עצמו רק בתפריט, ב-title וב-aria-label (רוחב קבוע). */
export function userInitial(name) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  return trimmed ? trimmed.charAt(0).toUpperCase() : null
}

/** השם הנגיש של כפתור החשבון: הכפתור מציג רק את האות הראשונה, ולכן השם המלא כאן */
export function accountButtonLabel(name, unreadMessages = 0) {
  const base = name ? `החשבון של ${name}` : 'החשבון שלי'
  return unreadMessages > 0 ? `${base}${unreadMessagesLabel(unreadMessages)}` : base
}

/** הרמז (title) של כפתור החשבון בריחוף: השם, ובשורה שנייה האימייל — כמו בתפריט עצמו */
export function accountButtonTitle(name, email) {
  const lines = [typeof name === 'string' && name.trim() ? name.trim() : 'החשבון שלי']
  if (typeof email === 'string' && email.trim()) lines.push(email.trim())
  return lines.join('\n')
}

/** טקסט למונה ההודעות (לקורא מסך): המספר לבדו אינו מובן */
export function unreadMessagesLabel(count) {
  return count === 1 ? ', הודעה חדשה אחת' : `, ${count} הודעות חדשות`
}

/**
 * הקישורים בתפריט החשבון, לפי הסדר. ההתנתקות אינה כאן — היא כפתור (signOut), לא קישור.
 * "ניהול" — רק למורשים (adminHref), עם מונה ההודעות שלא נקראו.
 */
export function accountMenuLinks(role, unreadMessages = 0) {
  const links = [{ href: '/library/dashboard', label: 'האזור האישי', icon: 'dashboard' }]
  const admin = adminHref(role)
  if (admin) {
    links.push({
      href: admin,
      label: 'ניהול',
      icon: 'admin_panel_settings',
      badge: unreadMessages > 0 ? unreadMessages : undefined
    })
  }
  return links
}

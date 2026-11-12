// ניווט פאנל הניהול (סרגל הצד) — לוגיקה טהורה, בלי React ובלי DOM, כדי שתהיה ניתנת
// לבדיקה בנפרד (adminNav.test.mjs). הרכיבים ב-src/components/admin/shell/ רק מציירים
// את מה שמחושב כאן.
//
// ההרשאות (roles) זהות בדיוק למה שהיה בשורת הלשוניות הקודמת (AdminNav). אין כאן
// הרחבה או צמצום של גישה: ה-proxy (src/proxy.js) והראוטים הם שאוכפים בפועל, והסרגל רק
// מסתיר קישורים שהצופה לא אמור לראות. התאימות בין השניים נבדקת ב-adminNav.proxy.test.js.
//
// "צופה" (viewer) = { role, isCorrectionsVolunteer, isSupervisor } מתוך ה-session. חלק מהגישה אינה לפי
// תפקיד אלא לפי דגל על משתמש רגיל (מתנדב תיקונים, מפקח) — ולכן הפונקציות מקבלות את הצופה כולו.
// מחרוזת תפקיד לבדה מתקבלת גם היא (צופה בלי דגלים).

import { LEGACY_PLUGIN_TABS } from './adminPlugins/pluginsQuery.js'

/** @typedef {'unreadMessages' | 'pendingUploads' | 'pendingPlugins'} AdminBadgeKey */
/** @typedef {'isCorrectionsVolunteer' | 'isSupervisor'} ViewerFlag */
/** @typedef {{ role?: string, isCorrectionsVolunteer?: boolean, isSupervisor?: boolean }} AdminViewer */

/**
 * @typedef {object} AdminNavItem
 * @property {string} id
 * @property {string} label            השם בסרגל (מילון השמות של הניהול); גם שם הכרטיס בלוח
 * @property {string} icon             שם גליף Material Symbols (חייב להיות בגופן המוקטן)
 * @property {string} href
 * @property {string[]} roles
 * @property {ViewerFlag[]} [flags]  דגלי משתמש שמתירים את הפריט גם בלי תפקיד מתאים
 * @property {AdminBadgeKey} [badge]   איזה מונה מוצג ליד הפריט
 * @property {boolean} [exact]         פעיל רק בהתאמה מדויקת לכתובת (הלוח)
 * @property {string[]} [alsoActiveOn] קידומות נוספות שמסמנות את הפריט כפעיל (דפי משנה בכתובת אחרת)
 * @property {string} [view]          כמה פריטים באותו עמוד: התצוגה (?view=) שהפריט מסמן
 * @property {boolean} [defaultView]   התצוגה של העמוד בלי ?view= (או עם ערך לא מוכר)
 */

/** @type {Record<string, AdminNavItem>} */
export const ADMIN_NAV_ITEMS = {
  dashboard: { id: 'dashboard', label: 'לוח', icon: 'analytics', href: '/library/admin', exact: true, roles: ['admin', 'admin_books', 'admin_plugins', 'admin_books_only', 'admin_ocr', 'model_trainer'] },
  users: { id: 'users', label: 'משתמשים', icon: 'group', href: '/library/admin/users', roles: ['admin'] },
  books: { id: 'books', label: 'ספרים', icon: 'menu_book', href: '/library/admin/books', roles: ['admin', 'admin_books', 'admin_books_only'] },
  // האשפה היא אשפת ההעלאות (/library/admin/trash) — לכן מסמנת את "העלאות"
  uploads: { id: 'uploads', label: 'העלאות', icon: 'upload_file', href: '/library/admin/uploads', badge: 'pendingUploads', alsoActiveOn: ['/library/admin/trash'], roles: ['admin', 'admin_books'] },
  // "תוספים" — עמוד אחד (/library/admin/plugins) בארבע תצוגות לפי ?view= (lib/adminPlugins/pluginsQuery).
  // "לאישור" נשאר בכתובת הישנה (בלי פרמטר) ועם המזהה plugins — המונה, הלוח וקישורים קיימים לא משתנים.
  plugins: { id: 'plugins', label: 'לאישור', icon: 'pending_actions', href: '/library/admin/plugins', view: 'pending', defaultView: true, badge: 'pendingPlugins', roles: ['admin', 'admin_plugins'] },
  'plugins-store': { id: 'plugins-store', label: 'בחנות', icon: 'shop', href: '/library/admin/plugins?view=store', view: 'store', roles: ['admin', 'admin_plugins'] },
  'plugins-layout': { id: 'plugins-layout', label: 'סידור החנות', icon: 'view_agenda', href: '/library/admin/plugins?view=layout', view: 'layout', roles: ['admin', 'admin_plugins'] },
  'plugins-service': { id: 'plugins-service', label: 'תוספי שירות', icon: 'hub', href: '/library/admin/plugins?view=service', view: 'service', roles: ['admin', 'admin_plugins'] },
  pages: { id: 'pages', label: 'עמודים', icon: 'description', href: '/library/admin/pages-management', roles: ['admin', 'admin_books'] },
  'ocr-training': { id: 'ocr-training', label: 'עמודים לאימון', icon: 'model_training', href: '/library/admin/ocr-training', roles: ['admin', 'admin_ocr', 'model_trainer'] },
  'ocr-lines': { id: 'ocr-lines', label: 'תמלול שורות', icon: 'edit_note', href: '/library/admin/ocr-lines', roles: ['admin', 'admin_ocr', 'model_trainer'] },
  'ocr-layout': { id: 'ocr-layout', label: 'תיוג מבנה', icon: 'space_dashboard', href: '/library/admin/ocr-layout', roles: ['admin', 'admin_ocr', 'model_trainer'] },
  'page-proof': { id: 'page-proof', label: 'הגהה', icon: 'fact_check', href: '/library/admin/page-proof', roles: ['admin', 'admin_ocr', 'model_trainer'] },
  'tzurat-hadaf': { id: 'tzurat-hadaf', label: 'צורת הדף', icon: 'splitscreen', href: '/library/admin/tzurat-hadaf', roles: ['admin', 'admin_books'] },
  // "הודעות" — עמוד אחד בשלוש לשוניות (?view=, lib/adminMessagesScreen/messagesQuery): נכנסות ונשלחו מסמנים את
  // "הודעות"; "תזכורות" (היה /library/admin/reminders, שמפנה לכאן) נשאר פריט משלו — קיצור ישיר למנהל ספרים,
  // ובאותן הרשאות בדיוק כמו קודם.
  messages: { id: 'messages', label: 'הודעות', icon: 'mail', href: '/library/admin/messages', view: 'inbox', defaultView: true, badge: 'unreadMessages', roles: ['admin', 'admin_plugins', 'admin_books'] },
  reminders: { id: 'reminders', label: 'תזכורות', icon: 'notifications', href: '/library/admin/messages?view=reminders', view: 'reminders', roles: ['admin', 'admin_books'] },
  dictionary: { id: 'dictionary', label: 'הצעות למילון', icon: 'spellcheck', href: '/library/admin/dictionary', roles: ['admin', 'admin_books'] },
  'book-info': { id: 'book-info', label: 'פרטי ספרים', icon: 'list_alt', href: '/library/admin/book-info', roles: ['admin', 'admin_books'] },
  // מחוץ ל-/library/admin אבל באותה מעטפת (corrections/layout.jsx). הגישה זהה ל-canHandleCorrections
  // שב-roles.js: מנהל כללי, מנהל ספרים, או כל משתמש עם דגל מתנדב תיקונים (נבדק ב-adminNav.test.mjs)
  corrections: { id: 'corrections', label: 'דיווחי טעויות', icon: 'rate_review', href: '/library/corrections', roles: ['admin', 'admin_books'], flags: ['isCorrectionsVolunteer'] },
  // מרחב העריכה (/library/dicta-edit/…), באותה מעטפת (moderation/layout.jsx, conflicts/layout.jsx). ה-proxy
  // מתיר לכל מחובר; ה-API אוכף — והסרגל מציג בדיוק לפי אותן בדיקות שב-roles.js (נבדק ב-adminNav.test.mjs):
  // "הצעות עריכה" = canModerateLibrary (מנהל כללי, מנהל ספרים, או משתמש עם דגל מפקח);
  // "התנגשויות בסנכרון" = canManageLibrarySync (מנהל כללי ומנהל ספרים בלבד).
  moderation: { id: 'moderation', label: 'הצעות עריכה', icon: 'rule', href: '/library/dicta-edit/moderation', roles: ['admin', 'admin_books'], flags: ['isSupervisor'] },
  conflicts: { id: 'conflicts', label: 'התנגשויות בסנכרון', icon: 'sync_problem', href: '/library/dicta-edit/conflicts', roles: ['admin', 'admin_books'] },
  'app-reports': { id: 'app-reports', label: 'דיווחי תקלות', icon: 'bug_report', href: '/library/admin/app-reports', roles: ['admin', 'developer'] },
  'search-feedback': { id: 'search-feedback', label: 'משוב חיפוש', icon: 'feedback', href: '/library/admin/search-feedback', roles: ['admin', 'model_trainer'] },
  'private-sources': { id: 'private-sources', label: 'מקורות פרטיים', icon: 'copyright', href: '/library/admin/private-sources', roles: ['admin'] },
}

/**
 * הקבוצות בסדר התצוגה. label: null — בלי כותרת (הלוח בראש).
 * @type {{ id: string, label: string | null, items: string[] }[]}
 */
export const ADMIN_NAV_GROUPS = [
  { id: 'home', label: null, items: ['dashboard'] },
  { id: 'books', label: 'ספרים', items: ['books', 'uploads', 'pages', 'tzurat-hadaf', 'book-info', 'dictionary', 'corrections', 'moderation', 'conflicts'] },
  { id: 'training', label: 'אימון מודלים', items: ['ocr-training', 'ocr-lines', 'ocr-layout', 'page-proof', 'search-feedback'] },
  { id: 'plugins', label: 'תוספים', items: ['plugins', 'plugins-store', 'plugins-layout', 'plugins-service'] },
  { id: 'people', label: 'אנשים', items: ['users', 'messages', 'reminders'] },
  { id: 'system', label: 'מערכת', items: ['app-reports', 'private-sources'] },
]

/**
 * שם המסך בכותרת (AdminScreenHeader ושלד הטעינה) — אותו שם כמו בסרגל, ממקור אחד. מזהה לא מוכר — שגיאה (לא כותרת ריקה).
 * @param {keyof typeof ADMIN_NAV_ITEMS} id
 */
export function adminScreenTitle(id) {
  const item = ADMIN_NAV_ITEMS[id]
  if (!item) throw new Error(`adminScreenTitle: אין פריט ניווט "${id}"`)
  return item.label
}

/**
 * שם של קבוצה בסרגל — כותרת של מסך אחד שמרכז כמה פריטים (למשל "תוספים": לאישור, בחנות, סידור, שירות).
 * @param {string} id
 */
export function adminNavGroupLabel(id) {
  const group = ADMIN_NAV_GROUPS.find((g) => g.id === id)
  if (!group?.label) throw new Error(`adminNavGroupLabel: אין קבוצה עם שם "${id}"`)
  return group.label
}

/**
 * הצופה מתוך מחרוזת תפקיד או מתוך session.user — רק השדות שהסרגל צריך, ודגל רק כשהוא true ממש.
 * @param {string | AdminViewer | null | undefined} viewer
 * @returns {AdminViewer}
 */
export function toAdminViewer(viewer) {
  if (!viewer || typeof viewer === 'string') return { role: viewer || undefined, isCorrectionsVolunteer: false, isSupervisor: false }
  return { role: viewer.role || undefined, isCorrectionsVolunteer: viewer.isCorrectionsVolunteer === true, isSupervisor: viewer.isSupervisor === true }
}

/**
 * האם הצופה רשאי לראות את הפריט: לפי תפקיד, או לפי דגל שהפריט מתיר.
 * @param {AdminNavItem} item
 * @param {string | AdminViewer | null | undefined} viewer
 */
export function canSeeNavItem(item, viewer) {
  const v = toAdminViewer(viewer)
  if (v.role && item.roles.includes(v.role)) return true
  return (item.flags || []).some((flag) => v[flag] === true)
}

/**
 * הקבוצות שהצופה רואה: פריטים לא מורשים מוסרים, קבוצה ריקה נעלמת, וקבוצה שנשאר בה
 * פריט אחד בלבד מוצגת בלי כותרת (label: null) — כותרת מעל פריט יחיד היא רעש.
 * @param {string | AdminViewer | null | undefined} viewer
 * @returns {{ id: string, label: string | null, items: AdminNavItem[] }[]}
 */
export function buildAdminNavGroups(viewer) {
  const groups = []
  for (const group of ADMIN_NAV_GROUPS) {
    const items = group.items.map((id) => ADMIN_NAV_ITEMS[id]).filter((item) => canSeeNavItem(item, viewer))
    if (items.length === 0) continue
    groups.push({ id: group.id, label: items.length === 1 ? null : group.label, items })
  }
  return groups
}

/** כל הפריטים שהצופה רואה, בסדר התצוגה */
export function visibleNavItems(viewer) {
  return buildAdminNavGroups(viewer).flatMap((group) => group.items)
}

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/** בלי לוכסן בסוף ובלי query/hash — כדי ש-"/library/admin/" ו-"/library/admin?x" יתאימו */
function normalizePath(pathname) {
  if (!pathname) return ''
  const clean = pathname.split(/[?#]/)[0]
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean
}

/**
 * האם הפריט מתאים לכתובת: התאמה מדויקת, או דף משנה (href/...), או אחת מקידומות alsoActiveOn.
 * פריט exact (הלוח) — רק בהתאמה מדויקת, אחרת כל עמוד ניהול היה מסמן אותו.
 */
export function navItemMatches(item, pathname, search) {
  const path = normalizePath(pathname)
  if (!path) return false
  if (item.view) return path === normalizePath(item.href) && currentView(item, pathname, search) === item.view
  if (item.exact) return path === item.href
  return matchesPrefix(path, item.href) || (item.alsoActiveOn || []).some((prefix) => matchesPrefix(path, prefix))
}

// תצוגות של עמוד אחד (תוספים): מתוך ?view= — מהפרמטר search, או מה-query שבתוך pathname. ?tab= הישן של
// מסך התוספים מתורגם כמו במסך עצמו (pluginsQuery.viewFromParams), כדי שהסרגל יסמן את מה שמוצג.
function currentView(item, pathname, search) {
  const raw = search ?? (String(pathname || '').includes('?') ? String(pathname).split('?')[1].split('#')[0] : '')
  const params = typeof raw === 'string' ? new URLSearchParams(raw) : raw
  const siblings = Object.values(ADMIN_NAV_ITEMS).filter((other) => other.view && normalizePath(other.href) === normalizePath(item.href))
  const known = (view) => siblings.some((other) => other.view === view)
  const view = params?.get?.('view')
  if (known(view)) return view
  const legacy = LEGACY_PLUGIN_TABS[params?.get?.('tab')]
  return known(legacy) ? legacy : siblings.find((other) => other.defaultView)?.view ?? null
}

/**
 * מזהה הפריט הפעיל מבין הפריטים הנתונים, או null. כשכמה מתאימים — הכתובת הארוכה (הספציפית)
 * מנצחת, כך שהתאמה לא תלויה בסדר הפריטים. search — ה-query של הכתובת (לפריטים עם view).
 * @param {AdminNavItem[]} items
 */
export function getActiveNavItemId(items, pathname, search) {
  let best = null
  let bestLength = -1
  for (const item of items) {
    if (!navItemMatches(item, pathname, search)) continue
    const path = normalizePath(pathname)
    const prefixes = [normalizePath(item.href), ...(item.alsoActiveOn || [])].filter((p) => matchesPrefix(path, p))
    // פריט תצוגה (view) — ספציפי יותר מכל פריט אחר באותה כתובת
    const length = Math.max(...prefixes.map((p) => p.length)) + (item.view ? 1 : 0)
    if (length > bestLength) {
      best = item.id
      bestLength = length
    }
  }
  return best
}

/** מספר המונה של פריט (0 אם אין לו מונה או שאין נתון) */
export function navItemCount(item, counts) {
  if (!item.badge || !counts) return 0
  const value = Number(counts[item.badge])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * הטקסט הנגיש של מונה — "3 הודעות שלא נקראו", "הודעה אחת שלא נקראה".
 * @param {AdminBadgeKey} badge
 */
export function countAccessibleLabel(badge, count) {
  const one = count === 1
  switch (badge) {
    case 'unreadMessages':
      return one ? 'הודעה אחת שלא נקראה' : `${count.toLocaleString('he-IL')} הודעות שלא נקראו`
    case 'pendingUploads':
      return one ? 'העלאה אחת שלא נבדקה' : `${count.toLocaleString('he-IL')} העלאות שלא נבדקו`
    case 'pendingPlugins':
      return one ? 'תוסף אחד לאישור' : `${count.toLocaleString('he-IL')} תוספים לאישור`
    default:
      return String(count)
  }
}

/**
 * תור ההעלאות שלא נבדקו, מהוותיקה לחדשה — היעד של "ממתין לטיפולך" בסרגל ושל הכרטיס בלוח.
 * אותו תנאי כמו המונה (ADMIN_BADGE_FILTERS.pendingUploads) וכמו הסינון במסך ההעלאות.
 */
export const UPLOADS_QUEUE_HREF = '/library/admin/uploads?status=not_checked&sort=oldest'

// "ממתין לטיפולך": סדר קבוע — הודעות קודם (הדרישה המפורשת: הודעה שלא נקראה גלויה מיד).
// href — יעד מיוחד לקיצור (התור המסונן); בלעדיו — הכתובת של פריט הסרגל.
const ATTENTION = [
  { item: 'messages', label: 'הודעות שלא נקראו' },
  { item: 'uploads', label: 'העלאות שלא נבדקו', href: UPLOADS_QUEUE_HREF },
  { item: 'plugins', label: 'תוספים לאישור' },
]

/**
 * רשימת "ממתין לטיפולך": רק פריטים שהצופה רואה ושהמונה שלהם גדול מ-0. רשימה ריקה = הקבוצה
 * לא מוצגת בכלל.
 * @returns {{ id: string, label: string, icon: string, href: string, count: number, accessibleLabel: string }[]}
 */
export function buildAttentionItems(viewer, counts) {
  const out = []
  for (const entry of ATTENTION) {
    const item = ADMIN_NAV_ITEMS[entry.item]
    if (!canSeeNavItem(item, viewer)) continue
    const count = navItemCount(item, counts)
    if (count === 0) continue
    out.push({ id: item.id, label: entry.label, icon: item.icon, href: entry.href || item.href, count, accessibleLabel: countAccessibleLabel(item.badge, count) })
  }
  return out
}

/** סך כל מה שב"ממתין לטיפולך" — לנקודה על כפתור התפריט בטלפון */
export function attentionTotal(attentionItems) {
  return attentionItems.reduce((sum, item) => sum + item.count, 0)
}

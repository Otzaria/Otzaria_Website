// שער ההרשאה של /library/admin/** ו-/api/admin/** לפי תפקידים — לוגיקה טהורה (בלי next/server ובלי
// JWT), כדי שתהיה ניתנת לבדיקה בנפרד (adminRouteAccess.test.mjs). src/proxy.js רק מתרגם את ההחלטה
// לתגובה (מעבר / 403 / הפניה).
//
// למשתמש יכולים להיות כמה תפקידים (roles.js) — הגישה היא איחוד: נתיב מותר אם אחד מהתפקידים מתיר
// אותו. כל תפקיד לבדו מתנהג בדיוק כמו קודם (רשימות ההיתר/החסימה לא השתנו).

import { ROLES, getRoles, hasAnyAdminAccess } from './roles.js'


// נתיבי דפים המותרים לכל מנהל תוספים
const PLUGINS_ADMIN_ALLOWED_PAGES = [
  '/library/admin/plugins',
  '/library/admin/messages',
];
const PLUGINS_ADMIN_ALLOWED_PAGE_EXACT = ['/library/admin'];

// נתיבי API המותרים לכל מנהל תוספים
const PLUGINS_ADMIN_ALLOWED_API = [
  '/api/admin/plugins',
  '/api/admin/plugin-notifications',
  // סידור חנות התוספים: קטגוריות, הגדרות דף הבית (נבחרים) ורשימת הלא-משוכנים
  '/api/admin/plugin-categories',
  '/api/admin/store-settings',
  '/api/admin/plugin-store',
  '/api/admin/users-basic',
  '/api/admin/stats',
];

// ===== מנהל ספרים-בלבד =====
// גישה אך ורק לעמוד ניהול הספרים (/library/admin/books) ולדשבורד, ולנתיבי ה-API
// המשרתים אותם. כל שאר נתיבי /library/admin ו-/api/admin חסומים (העלאות,
// עמודים, מילון, מידע/כינויים, משתמשים, תוספים וכו').
const BOOKS_ONLY_ADMIN_ALLOWED_PAGES = [
  '/library/admin/books',
];
const BOOKS_ONLY_ADMIN_ALLOWED_PAGE_EXACT = ['/library/admin'];
const BOOKS_ONLY_ADMIN_ALLOWED_API = [
  '/api/admin/books',
  '/api/admin/categories',
  '/api/admin/mailing-list',
  '/api/admin/book-statuses',
  '/api/admin/stats',
];

// ===== מנהל OCR =====
// גישה אך ורק לשלושת אזורי הניהול של ה-OCR (מאגר אימון, תמלול שורות, תיוג
// מבנה עמוד) ולדשבורד, ולנתיבי ה-API המשרתים אותם. כל שאר /library/admin
// ו-/api/admin חסומים.
const OCR_ADMIN_ALLOWED_PAGES = [
  '/library/admin/ocr-training',
  '/library/admin/ocr-lines',
  '/library/admin/ocr-layout',
  '/library/admin/page-proof',
];
const OCR_ADMIN_ALLOWED_PAGE_EXACT = ['/library/admin'];
const OCR_ADMIN_ALLOWED_API = [
  '/api/admin/ocr-training',
  '/api/admin/ocr-lines',
  '/api/admin/ocr-layout',
  '/api/admin/page-proof',
  '/api/admin/training-proof',
  '/api/admin/stats',
];

// ===== מאמן מודלים =====
// בדיוק מה שמנהל OCR מקבל, ובנוסף דף משוב החיפוש. ה-API של המשוב אינו תחת /api/admin
// (/api/search-feedback/admin) ונבדק בראוט עצמו (hasSearchFeedbackAccess).
const MODEL_TRAINER_ALLOWED_PAGES = [...OCR_ADMIN_ALLOWED_PAGES, '/library/admin/search-feedback'];
const MODEL_TRAINER_ALLOWED_PAGE_EXACT = ['/library/admin'];
const MODEL_TRAINER_ALLOWED_API = OCR_ADMIN_ALLOWED_API;

// נתיבי דפים/API החסומים למנהל ספרים (אזורי ה-OCR — למנהל גלובלי ולמנהל OCR בלבד)
const BOOKS_ADMIN_BLOCKED_PAGES = [
  '/library/admin/users',
  '/library/admin/plugins',
  '/library/admin/ocr-training',
  '/library/admin/ocr-lines',
  '/library/admin/ocr-layout',
  '/library/admin/page-proof',
  '/library/admin/private-sources',
  '/library/admin/search-feedback',
];
const BOOKS_ADMIN_BLOCKED_API = [
  '/api/admin/users',
  '/api/admin/private-sources',
  '/api/admin/institute-outreach',
  '/api/admin/plugins',
  '/api/admin/plugin-notifications',
  '/api/admin/plugin-categories',
  '/api/admin/store-settings',
  '/api/admin/plugin-store',
  '/api/admin/export-backup',
  '/api/admin/ocr-training',
  '/api/admin/ocr-lines',
  '/api/admin/ocr-layout',
  '/api/admin/page-proof',
  '/api/admin/training-proof',
];

// ===== מפתח =====
// דיווחי התוכנה בלבד (דפים — ה-API שלהם אינו תחת /api/admin ונבדק בראוט עצמו).
const DEVELOPER_ALLOWED_PAGES = ['/library/admin/app-reports']
const DEVELOPER_HOME = '/library/admin/app-reports'

const matchesPrefix = (path, p) => path === p || path.startsWith(p + '/')

/** האם תפקיד אחד (לבדו) מתיר את הנתיב */
function roleAllows(role, path, isApi) {
  switch (role) {
    case ROLES.ADMIN:
      return true
    case ROLES.ADMIN_PLUGINS:
      return isApi
        ? PLUGINS_ADMIN_ALLOWED_API.some((p) => path.startsWith(p))
        : PLUGINS_ADMIN_ALLOWED_PAGE_EXACT.includes(path) || PLUGINS_ADMIN_ALLOWED_PAGES.some((p) => path.startsWith(p))
    case ROLES.ADMIN_BOOKS_ONLY:
      return isApi
        ? BOOKS_ONLY_ADMIN_ALLOWED_API.some((p) => matchesPrefix(path, p))
        : BOOKS_ONLY_ADMIN_ALLOWED_PAGE_EXACT.includes(path) || BOOKS_ONLY_ADMIN_ALLOWED_PAGES.some((p) => matchesPrefix(path, p))
    case ROLES.ADMIN_OCR:
      return isApi
        ? OCR_ADMIN_ALLOWED_API.some((p) => matchesPrefix(path, p))
        : OCR_ADMIN_ALLOWED_PAGE_EXACT.includes(path) || OCR_ADMIN_ALLOWED_PAGES.some((p) => matchesPrefix(path, p))
    case ROLES.MODEL_TRAINER:
      return isApi
        ? MODEL_TRAINER_ALLOWED_API.some((p) => matchesPrefix(path, p))
        : MODEL_TRAINER_ALLOWED_PAGE_EXACT.includes(path) || MODEL_TRAINER_ALLOWED_PAGES.some((p) => matchesPrefix(path, p))
    case ROLES.ADMIN_BOOKS:
      // מנהל ספרים - הכל חוץ ממשתמשים, תוספים ואזורי ה-OCR
      return !(isApi ? BOOKS_ADMIN_BLOCKED_API : BOOKS_ADMIN_BLOCKED_PAGES).some((p) => matchesPrefix(path, p))
    case ROLES.DEVELOPER:
      return !isApi && DEVELOPER_ALLOWED_PAGES.some((p) => matchesPrefix(path, p))
    default:
      return false
  }
}

/**
 * ההחלטה לנתיב ניהול (/library/admin/** או /api/admin/**) עבור הצופה.
 * @param {string | string[] | { role?: string, roles?: string[] } | null | undefined} subject  תפקיד, מערך, או ה-JWT
 * @param {string} path
 * @returns {{ action: 'allow' } | { action: 'deny' } | { action: 'redirect', to: string }}
 */
export function adminRouteDecision(subject, path) {
  const roles = getRoles(subject)
  const isApi = path.startsWith('/api/')
  // מפתח בלבד (בלי אף תפקיד ניהול) — הלוח אינו שלו: מפנים לדיווחי התוכנה
  if (path === '/library/admin' && !hasAnyAdminAccess(roles) && roles.includes(ROLES.DEVELOPER)) {
    return { action: 'redirect', to: DEVELOPER_HOME }
  }
  return roles.some((role) => roleAllows(role, path, isApi)) ? { action: 'allow' } : { action: 'deny' }
}

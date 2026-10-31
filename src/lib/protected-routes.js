/**
 * protected-routes — הנתיבים הדורשים התחברות.
 *
 * מקור אמת אחד, שמשמש גם את ה-proxy (שכופה את ההתחברות) וגם את
 * scripts/check-perf-budget.mjs (שמוודא שדף ציבורי אינו מבצע prefetch לנתיב
 * מוגן — לאורח זה בקשת RSC שנגמרת ב-redirect לדף ההתחברות, ואז גם חבילות
 * ה-JavaScript של דף ההתחברות).
 */

export const PROTECTED_PREFIXES = [
  '/plugins/upload',
  '/library/dashboard',
  '/library/admin',
  '/library/upload',
  '/library/books',
  '/library/book',
  '/library/edit',
  '/library/users',
  '/library/info',
  '/library/acronyms',
  '/library/ocr-training',
  '/library/ocr-lines',
  '/library/page-proof',
  '/library/tzurat-hadaf',
  '/library/corrections',
  '/api/admin',
  '/api/ocr-training',
  '/api/ocr-lines',
  '/api/page-proof',
  '/api/training-proof',
  '/api/tzurat-hadaf',
  '/api/library/book-info',
  '/api/library/book-acronyms',
  '/api/upload-text',
  '/api/corrections',
  '/api/app-reports/admin',
  '/api/search-feedback/admin',
]

// דף ניהול השירות של תוסף (/plugins/<id>/service). [id] — תבנית הדף עצמו, ל-check-prefetch.
const PLUGIN_SERVICE_PAGE_RE = /^\/plugins\/(?:[a-f0-9]{24}|\[id\])\/service(?:\/|$)/i

export const isProtectedPath = (path) =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/')) ||
  PLUGIN_SERVICE_PAGE_RE.test(path)

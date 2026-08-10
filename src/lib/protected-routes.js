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
  '/library/dicta-books',
  '/library/ocr-training',
  '/library/ocr-lines',
  '/api/admin',
  '/api/ocr-training',
  '/api/ocr-lines',
  '/api/library/book-info',
  '/api/library/book-acronyms',
  '/api/upload-text',
]

export const isProtectedPath = (path) =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))

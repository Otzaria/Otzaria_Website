// פרמטרים של GET /api/page-content/ocr-data — לוגיקה טהורה (בלי imports).

export const INVALID_BOOK_PATH_HE = 'נתיב ספר לא תקין';

/**
 * bookPath כמו ב-GET /api/page-content: searchParams כבר מפענח פעם אחת, ומפענחים פעם נוספת
 * (הלקוח שולח encodeURIComponent של נתיב שעשוי להיות מקודד כבר). רצף '%' פגום (למשל '%E0%A4'
 * או '%' בודד) — decodeURIComponent זורק URIError; כאן מוחזר null והראוט עונה 400 ולא 500.
 * @param {string} raw הערך מ-searchParams.get('bookPath')
 * @returns {string|null}
 */
export function decodeBookPathParam(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

// נתיבי הנכסים של tesseract.js המאוחסנים אצלנו (public/vendor/tesseract/, מועתקים ב-build ע"י
// scripts/copy-tesseract-assets.mjs). מקור אמת יחיד לסקריפט ולקוד הלקוח — טהור, בלי imports.
//
// למה לא ה-CDN של ברירת המחדל: ה-CSP (script-src/connect-src 'self') חוסם את jsdelivr, וכך
// גם אין תלות בשירות חיצוני. כל הנתיבים כוללים גרסה, ולכן next.config.ts מגיש אותם immutable.

export const TESSERACT_PUBLIC_DIR = 'vendor/tesseract';

// Rivok Lite 2.0 לשימוש בדפדפן. ה-sha256 של קובץ ה-traineddata נבדק לפני הדחיסה.
// הרישיון והייחוס נכללים ב-public/licenses/tesseract-heb-rivok/.
export const HEB_LANG = Object.freeze({
  language: 'heb_rivok_lite',
  model: 'heb-rivok-lite-v2.0',
  url: 'https://github.com/RivoksLab/tesseract-heb-rivok/releases/download/v2.0/heb_rivok_lite.traineddata',
  sha256: '59da073ad0bca9449fa5a965996e49d0e2bee3c17e8b0b4e2769d67a7ce34c40',
});

/**
 * @param {string} version גרסת tesseract.js המותקנת (worker וה-core חייבים להתאים לה)
 * @param {string} [origin] '' לנתיב יחסי-לשורש
 */
export function tesseractAssetUrls(version, origin = '') {
  const root = `${origin}/${TESSERACT_PUBLIC_DIR}`;
  return {
    workerPath: `${root}/v${version}/worker.min.js`,
    // תיקייה — tesseract בוחר בעצמו בין גרסאות SIMD/LSTM של ה-core
    corePath: `${root}/v${version}/core`,
    langPath: `${root}/lang/${HEB_LANG.model}`,
    // מפתח המטמון ב-IndexedDB כולל את גרסת המודל, גם כשהשם של קובץ השפה זהה.
    cachePath: `otzaria-${HEB_LANG.model}`,
  };
}

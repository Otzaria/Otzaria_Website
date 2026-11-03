// נתיבי הנכסים של tesseract.js המאוחסנים אצלנו (public/vendor/tesseract/, מועתקים ב-build ע"י
// scripts/copy-tesseract-assets.mjs). מקור אמת יחיד לסקריפט ולקוד הלקוח — טהור, בלי imports.
//
// למה לא ה-CDN של ברירת המחדל: ה-CSP (script-src/connect-src 'self') חוסם את jsdelivr, וכך
// גם אין תלות בשירות חיצוני. כל הנתיבים כוללים גרסה, ולכן next.config.ts מגיש אותם immutable.

export const TESSERACT_PUBLIC_DIR = 'vendor/tesseract';

// מודל העברית לזיהוי המילים (tessdata_best_int, ~570KB gz) — מ-@tesseract.js-data/heb בגרסה
// נעולה; ה-sha256 נבדק בסקריפט לפני השמירה.
export const HEB_LANG = Object.freeze({
  model: 'heb-4.0.0_best_int',
  url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/heb@1.0.0/4.0.0_best_int/heb.traineddata.gz',
  sha256: '9c70b524200dae77fb25e3567566eee600ccbcae9aeb89722990ccae0e84e805',
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
    // מפתח המטמון ב-IndexedDB — נפרד מ-'heb' של /tessdata, שעשוי להיות מודל אחר
    cachePath: `otzaria-${HEB_LANG.model}`,
  };
}

/**
 * המוצרים ששולחים דיווחים לאותו שרת. כל מוצר פותח issues בריפו משלו, ומספרי issue אינם ייחודיים
 * בין ריפו לריפו — לכן כל שאילתה לפי issueNumber/signatureHash מצומצמת למוצר (productFilter).
 * טהור: משמש גם ברכיבי הניהול בצד הלקוח.
 */
export const DEFAULT_PRODUCT = 'otzaria';

export const PRODUCTS = Object.freeze({
  otzaria: Object.freeze({ key: 'otzaria', repo: 'Otzaria/otzaria', displayName: 'אוצריא' }),
  'offline-update': Object.freeze({ key: 'offline-update', repo: 'Otzaria/Otzaria_Offline_update', displayName: 'עדכוני אוצריא' }),
});

export const PRODUCT_KEYS = Object.freeze(Object.keys(PRODUCTS));

// hasOwn: מפתח כמו "constructor" לא ייחשב מוצר
export const isProductKey = (key) => typeof key === 'string' && Object.hasOwn(PRODUCTS, key);

/** המוצר של מסמך; דיווח ישן בלי השדה שייך לאוצריא. */
export const productOf = (doc) => (isProductKey(doc?.product) ? doc.product : DEFAULT_PRODUCT);

/** @returns {{key:string, repo:string, displayName:string}} */
export const getProduct = (key) => PRODUCTS[isProductKey(key) ? key : DEFAULT_PRODUCT];

/** תנאי Mongo למוצר. לאוצריא כולל גם מסמכים בלי השדה (null תואם שדה חסר), כך שאין צורך במיגרציה. */
export function productFilter(key) {
  const product = isProductKey(key) ? key : DEFAULT_PRODUCT;
  return product === DEFAULT_PRODUCT ? { product: { $in: [null, DEFAULT_PRODUCT] } } : { product };
}

/** המוצר לפי שם הריפו המלא (owner/name, בלי תלות ברישיות), או null לריפו שאינו שלנו. */
export function productByRepo(fullName) {
  if (typeof fullName !== 'string') return null;
  const name = fullName.toLowerCase();
  return PRODUCT_KEYS.find((k) => PRODUCTS[k].repo.toLowerCase() === name) ?? null;
}

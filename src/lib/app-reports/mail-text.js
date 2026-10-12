/**
 * שם המוצר במיילים של דיווחי התוכנה (שולח, כותרת, שורת התודה). טהור — נבדק ב-core.test.mjs.
 */
import { getProduct } from './products.js';

/** @returns {{brandName:string, fromName:string, teamName:string, thanksLine:string}} */
export function appReportMailBranding(product) {
  const name = getProduct(product).displayName;
  return {
    brandName: name,
    fromName: name,
    teamName: `צוות ${name}`,
    thanksLine: `תודה שעזרת לשפר את ${name}!`,
  };
}

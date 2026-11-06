/**
 * טביעות אצבע של דיווח: contentHash ל-idempotency ו-signatureHash לאיחוד קריסות זהות.
 */
import crypto from 'node:crypto';
import { canonicalJson, sha256Hex } from '../corrections/ocj1.js';
import { DEFAULT_PRODUCT } from './products.js';

/** @param {object} report ערך מנורמל מ-validateAppReport */
export function computeContentHash(report) {
  const fields = {
    type: report.type,
    trigger: report.trigger,
    title: report.title || '',
    description: report.description || '',
    stepsToReproduce: report.stepsToReproduce || '',
    reporterEmail: report.reporterEmail || '',
    appVersion: report.appVersion || '',
    platform: report.platform,
    signature: report.signature
      ? { exceptionType: report.signature.exceptionType || '', frames: [...(report.signature.frames || [])] }
      : null,
  };
  // אוצריא בלי המוצר בטביעה — דיווח ישן שנשלח שוב חייב להישאר duplicate ולא 409
  const product = report.product || DEFAULT_PRODUCT;
  if (product !== DEFAULT_PRODUCT) fields.product = product;
  return sha256Hex(canonicalJson(fields));
}

/** @returns {string|null} null כשאין חתימה או ש-exceptionType ריק */
export function computeSignatureHash(signature) {
  if (!signature || !signature.exceptionType) return null;
  return sha256Hex(`${signature.exceptionType}\n${(signature.frames || []).join('\n')}`);
}

const bufferHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * טביעה של שליחה חוזרת: אותו תוכן עם אותו לוג וקבצים מצורפים, תחת reportId חדש.
 * בגרסה 1 האבחון נשאר מחוץ לטביעה לצורך תאימות. בגרסה 2 כל שינוי
 * באבחון הוא שינוי בצרופה, גם כשהטקסט שהמשתמש כתב נשאר זהה.
 */
export function computeResendHash(contentHash, report) {
  const fields = {
    contentHash,
    errorLog: report.errorLog || '',
    minidump: report.minidump ? bufferHash(report.minidump.buffer) : null,
    images: (report.images || []).map((image) => bufferHash(image.buffer)),
  };
  if (report.schema === 2) {
    // אותם בתים של JSON קומפקטי שנשמרים ב-GridFS. אבחון יכול לכלול שברים
    // ולכן אין להעביר את האובייקט עצמו ל-OCJ-1 שמאפשר רק מספרים שלמים.
    fields.diagnostics = report.diagnostics ? sha256Hex(JSON.stringify(report.diagnostics)) : null;
  }
  return sha256Hex(canonicalJson(fields));
}

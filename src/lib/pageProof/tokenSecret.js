// מפתח-גישה לתוכנת-הספר — יצירה וגיבוב (צד-שרת בלבד: node:crypto). הכללים: tokenRules.js.
// לסוד אקראי של 256 ביט אין צורך ב-bcrypt: SHA-256 מספיק, והחיפוש לפי הגיבוב הוא חיפוש באינדקס.

import { createHash, randomBytes } from 'node:crypto';
import { TOKEN_PREFIX } from './tokenRules.js';

export const TOKEN_BYTES = 32;

export function generateToken() {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

export function hashToken(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

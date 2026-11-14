// צורת הדף — מפתח-גישה: יצירה וגיבוב (צד-שרת בלבד: node:crypto). הכללים: tokenRules.js.

import { createHash, randomBytes } from 'node:crypto';
import { TOKEN_PREFIX } from './tokenRules.js';

export const TOKEN_BYTES = 32;

export function generateToken() {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

export function hashToken(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

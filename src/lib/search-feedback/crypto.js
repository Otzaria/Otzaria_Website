/**
 * זהות אנונימית של התקנה: מפתח ed25519. keyId נגזר תמיד בשרת מהמפתח הציבורי.
 */
import crypto from 'node:crypto';

// כותרת DER של SubjectPublicKeyInfo ל-ed25519; אחריה 32 בתי המפתח הגולמי.
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export const PUBLIC_KEY_BYTES = 32;
export const SIGNATURE_BYTES = 64;
export const KEY_ID_RE = /^[A-Za-z0-9_-]{43}$/;

const STD_BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** base64 תקני עם ריפוד, באורך מדויק; אחרת null. */
export function decodeStrictBase64(value, expectedBytes) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !STD_BASE64_RE.test(value)) return null;
  const buf = Buffer.from(value, 'base64');
  // Buffer.from מדלג בשקט על קלט פגום; השוואה חוזרת תופסת קידוד לא קנוני.
  if (buf.length !== expectedBytes || buf.toString('base64') !== value) return null;
  return buf;
}

/** base64url בלי ריפוד של SHA-256 על 32 בתי המפתח הגולמי (43 תווים). */
export function computeKeyId(rawPublicKey) {
  return crypto.createHash('sha256').update(rawPublicKey).digest('base64url');
}

/**
 * @param {Uint8Array} body הבתים הגולמיים בדיוק כפי שהתקבלו
 * @param {string} signatureB64
 * @param {Buffer} rawPublicKey
 */
export function verifyBodySignature(body, signatureB64, rawPublicKey) {
  const signature = decodeStrictBase64(signatureB64, SIGNATURE_BYTES);
  if (!signature || rawPublicKey?.length !== PUBLIC_KEY_BYTES) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, rawPublicKey]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, body, key, signature);
  } catch {
    return false;
  }
}

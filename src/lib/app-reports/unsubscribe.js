/**
 * טוקן הסרה מהתראות סגירה: reportId חתום ב-HMAC (אין תפוגה — קישור במייל).
 */
import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_PURPOSE = 'app-reports-unsubscribe';
// purpose מפריד בין סוגי הקישורים: טוקן של דיווח תוכנה לא יעבוד בהסרה מדיווחי ספרייה.
const sign = (reportId, secret, purpose) => createHmac('sha256', secret).update(`${purpose}:${reportId}`).digest('base64url');

export function createUnsubscribeToken(reportId, secret, purpose = DEFAULT_PURPOSE) {
  if (!secret) throw new Error('unsubscribe secret missing');
  return `${Buffer.from(reportId, 'utf8').toString('base64url')}.${sign(reportId, secret, purpose)}`;
}

/** @returns {string|null} reportId כשהחתימה תקינה */
export function verifyUnsubscribeToken(token, secret, purpose = DEFAULT_PURPOSE) {
  if (!secret || typeof token !== 'string' || token.length > 400) return null;
  const [idPart, sig, extra] = token.split('.');
  if (!idPart || !sig || extra !== undefined) return null;
  const reportId = Buffer.from(idPart, 'base64url').toString('utf8');
  if (!reportId) return null;
  const expected = Buffer.from(sign(reportId, secret, purpose));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return reportId;
}

export function buildUnsubscribeUrl(siteUrl, reportId, secret) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  return `${base}/api/app-reports/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(reportId, secret))}`;
}

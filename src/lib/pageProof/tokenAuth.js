import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PageProofToken from '@/models/PageProofToken';
import User from '@/models/User';
import { hasOcrAccess } from '@/lib/roles';
import { getClientIp } from '@/lib/client-ip';
import { bearerOf, isTokenFormat, missingScope, shouldTouch, tokenState, TOUCH_MS, VIA_SUFFIX } from './tokenRules';
import { hashToken } from './tokenSecret';
import { bearerFailures } from './tokenThrottle';

// ההרשאה בראוטי הניהול של הגהת-העמודים שמקבלים גם מפתח-גישה של תוכנת-הספר.
//
//   const { session, denied: keyDenied } = await getPageProofSession(request, 'read');
//   if (keyDenied) return keyDenied;
//   const denied = requireAccess(session, hasOcrAccess);   // כמו תמיד
//   if (denied) return denied;
//
// בלי "Authorization: Bearer" — בדיוק getServerSession, כמו עד היום (keyDenied תמיד null).
// עם Bearer — רק המפתח קובע (לא נופלים ל-session): גיבוב ← חיפוש במסד (בכל בקשה, בלי מטמון —
// ביטול חל מיד) ← לא בוטל ולא פג ← המשתמש נקרא מהמסד ועדיין מנהל OCR ← יש למפתח ההרשאה
// (scope: 'read' | 'review' | 'import', או כמה — כולן נדרשות). אז session מדומה:
// {user: {id, _id, name: '<שם> (תוכנת-הספר)', role}, via: 'token', tokenId, scopes},
// ו-requireAccess עובד עליו בלי שינוי.
//
// קודים (בגוף: {success:false, error, code}):
//   401 token_invalid / token_revoked / token_expired — נספרים בהאטה לפי IP (tokenThrottle)
//   403 token_user  — המשתמש כבר אינו מנהל OCR;  403 token_scope — אין למפתח ההרשאה
//   429 token_throttled — יותר מדי ניסיונות שגויים מהכתובת (Retry-After)
// ראוט שלא קורא לפונקציה הזו אינו מקבל מפתח (getServerSession אינו מכיר Bearer).

const NO_STORE = 'private, no-store';
const REALM = 'Bearer realm="page-proof"';

const MSG = {
  token_invalid: 'מפתח-הגישה אינו תקף',
  token_revoked: 'מפתח-הגישה בוטל — צרו מפתח חדש בדף הניהול של הגהת-העמודים',
  token_expired: 'תוקף מפתח-הגישה פג — צרו מפתח חדש בדף הניהול של הגהת-העמודים',
  token_user: 'למשתמש שיצר את מפתח-הגישה אין עוד הרשאת ניהול OCR',
  token_scope: 'למפתח-הגישה אין הרשאה לפעולה הזו',
  token_throttled: 'יותר מדי ניסיונות עם מפתח-גישה שגוי מהכתובת הזו — נסו שוב בעוד כמה דקות',
};

function keyError(status, code, headers = {}) {
  return NextResponse.json({ success: false, error: MSG[code], code }, { status, headers: { 'Cache-Control': NO_STORE, ...headers } });
}

const deny = (res) => ({ session: null, denied: res });

// ניסיון שגוי: נספר, ו-401
function failed(ip, code) {
  bearerFailures.fail(ip);
  return deny(keyError(401, code, { 'WWW-Authenticate': `${REALM}, error="invalid_token"` }));
}

export async function getPageProofSession(request, scope) {
  const presented = bearerOf(request?.headers?.get?.('authorization') ?? null);
  if (presented === null) return { session: await getServerSession(authOptions), denied: null };

  const ip = getClientIp(request);
  const wait = bearerFailures.blockedFor(ip);
  if (wait) return deny(keyError(429, 'token_throttled', { 'Retry-After': String(wait) }));
  if (!isTokenFormat(presented)) return failed(ip, 'token_invalid');

  await connectDB();
  const doc = await PageProofToken.findOne({ hash: hashToken(presented) }, { user: 1, scopes: 1, expiresAt: 1, revokedAt: 1, lastUsedAt: 1 }).lean();
  if (!doc) return failed(ip, 'token_invalid');
  const now = new Date();
  const state = tokenState(doc, now);
  if (state === 'revoked') return failed(ip, 'token_revoked');
  if (state === 'expired') return failed(ip, 'token_expired');

  // המשתמש — מהמסד בכל שימוש: מנהל שהורד מתפקידו, המפתחות שלו מפסיקים לפעול מיד
  const user = await User.findById(doc.user, { name: 1, role: 1 }).lean();
  if (!user) return failed(ip, 'token_invalid');
  if (!hasOcrAccess(user.role)) return deny(keyError(403, 'token_user'));

  // בלי הרשאה נדרשת (טעות בראוט) — נדחה, לא "הכול מותר"
  const need = (Array.isArray(scope) ? scope : [scope]).filter(Boolean);
  if (!need.length || missingScope(doc.scopes, need)) {
    return deny(keyError(403, 'token_scope', { 'WWW-Authenticate': `${REALM}, error="insufficient_scope", scope="${need.join(' ')}"` }));
  }

  if (shouldTouch(doc.lastUsedAt, now)) {
    // מותנה — שתי בקשות במקביל כותבות פעם אחת; כשל כאן אינו מכשיל את הבקשה
    await PageProofToken.updateOne(
      { _id: doc._id, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lte: new Date(now.getTime() - TOUCH_MS) } }] },
      { $set: { lastUsedAt: now } }
    ).catch((e) => console.error('page-proof token lastUsedAt', e?.name));
  }

  const id = String(user._id);
  return {
    session: {
      user: { id, _id: id, name: `${user.name || ''}${VIA_SUFFIX}`, role: user.role },
      via: 'token',
      tokenId: String(doc._id),
      scopes: [...(doc.scopes || [])],
    },
    denied: null,
  };
}

// ראוט שאינו מקבל מפתח (אבל חולק קוד עם ראוט שכן) — אותה צורה, רק session
export async function getSessionOnly() {
  return { session: await getServerSession(authOptions), denied: null };
}

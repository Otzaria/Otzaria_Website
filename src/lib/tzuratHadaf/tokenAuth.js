import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import TzuratToken from '@/models/TzuratToken';
import User from '@/models/User';
import { hasTzuratAdminAccess, getRoles } from '@/lib/roles';
import { getClientIp } from '@/lib/client-ip';
import { createFailThrottle } from '@/lib/pageProof/tokenThrottle';
import { bearerOf, isTokenFormat, missingScope, shouldTouch, tokenState, TOUCH_MS, VIA_SUFFIX } from './tokenRules';
import { hashToken } from './tokenSecret';

// צורת הדף — ההרשאה בראוטי הניהול שמקבלים גם מפתח-גישה (Bearer tht_…). אותו דפוס בדיוק כמו
// lib/pageProof/tokenAuth.js (שם ההסבר המלא):
//
//   const { session, denied: keyDenied } = await getTzuratSession(request, 'read');
//   if (keyDenied) return keyDenied;
//   const denied = requireAccess(session, hasTzuratAdminAccess);
//
// בלי Bearer — getServerSession. עם Bearer — רק המפתח קובע: גיבוב ← חיפוש ← לא בוטל ולא פג ← המשתמש עדיין מנהל
// המודול ← יש למפתח ההרשאה (read/review/import). אז session מדומה {user:{id,_id,name,role}, via:'token', ...}.
// קודים: 401 token_invalid/revoked/expired (נספרים בהאטה לפי IP), 403 token_user/token_scope, 429 token_throttled.

const NO_STORE = 'private, no-store';
const REALM = 'Bearer realm="tzurat-hadaf"';

const MSG = {
  token_invalid: 'מפתח-הגישה אינו תקף',
  token_revoked: 'מפתח-הגישה בוטל — צרו מפתח חדש בדף הניהול של צורת הדף',
  token_expired: 'תוקף מפתח-הגישה פג — צרו מפתח חדש בדף הניהול של צורת הדף',
  token_user: 'למשתמש שיצר את מפתח-הגישה אין עוד הרשאת ניהול של צורת הדף',
  token_scope: 'למפתח-הגישה אין הרשאה לפעולה הזו',
  token_throttled: 'יותר מדי ניסיונות עם מפתח-גישה שגוי מהכתובת הזו — נסו שוב בעוד כמה דקות',
};

export const tzuratBearerFailures = createFailThrottle();

function keyError(status, code, headers = {}) {
  return NextResponse.json({ error: MSG[code], code }, { status, headers: { 'Cache-Control': NO_STORE, ...headers } });
}

const deny = (res) => ({ session: null, denied: res });

function failed(ip, code) {
  tzuratBearerFailures.fail(ip);
  return deny(keyError(401, code, { 'WWW-Authenticate': `${REALM}, error="invalid_token"` }));
}

export async function getTzuratSession(request, scope) {
  const presented = bearerOf(request?.headers?.get?.('authorization') ?? null);
  if (presented === null) return { session: await getServerSession(authOptions), denied: null };

  const ip = getClientIp(request);
  const wait = tzuratBearerFailures.blockedFor(ip);
  if (wait) return deny(keyError(429, 'token_throttled', { 'Retry-After': String(wait) }));
  if (!isTokenFormat(presented)) return failed(ip, 'token_invalid');

  await connectDB();
  const doc = await TzuratToken.findOne({ hash: hashToken(presented) }, { user: 1, scopes: 1, expiresAt: 1, revokedAt: 1, lastUsedAt: 1 }).lean();
  if (!doc) return failed(ip, 'token_invalid');
  const now = new Date();
  const state = tokenState(doc, now);
  if (state === 'revoked') return failed(ip, 'token_revoked');
  if (state === 'expired') return failed(ip, 'token_expired');

  const user = await User.findById(doc.user, { name: 1, role: 1, roles: 1 }).lean();
  if (!user) return failed(ip, 'token_invalid');
  if (!hasTzuratAdminAccess(user)) return deny(keyError(403, 'token_user'));

  const need = (Array.isArray(scope) ? scope : [scope]).filter(Boolean);
  if (!need.length || missingScope(doc.scopes, need)) {
    return deny(keyError(403, 'token_scope', { 'WWW-Authenticate': `${REALM}, error="insufficient_scope", scope="${need.join(' ')}"` }));
  }

  if (shouldTouch(doc.lastUsedAt, now)) {
    await TzuratToken.updateOne(
      { _id: doc._id, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lte: new Date(now.getTime() - TOUCH_MS) } }] },
      { $set: { lastUsedAt: now } }
    ).catch((e) => console.error('tzurat token lastUsedAt', e?.name));
  }

  const id = String(user._id);
  return {
    session: {
      user: { id, _id: id, name: `${user.name || ''}${VIA_SUFFIX}`, role: user.role, roles: getRoles(user) },
      via: 'token',
      tokenId: String(doc._id),
      scopes: [...(doc.scopes || [])],
    },
    denied: null,
  };
}

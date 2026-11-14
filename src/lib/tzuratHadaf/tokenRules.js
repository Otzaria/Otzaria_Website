// צורת הדף — מפתחות-גישה לכלי של צורת הדף (ייבוא חבילות, ייצוא, סנכרון) — הכללים הטהורים. אותו דפוס בדיוק
// כמו lib/pageProof/tokenRules.js (שם ההסבר המלא), עם קידומת משלו ונתיב משלו. בלי מסד ובלי crypto — ה-proxy
// ומסך הניהול מייבאים אותו. יצירה וגיבוב: tokenSecret.js; האימות בבקשה: tokenAuth.js; המודל: models/TzuratToken.js.
//
// המפתח = "tht_" + 32 בתים אקראיים (base64url, 43 תווים), ומוצג פעם אחת, ביצירה. במסד — רק SHA-256 ו-8 התווים הראשונים.

export const TOKEN_PREFIX = 'tht_';
export const TOKEN_RE = /^tht_[A-Za-z0-9_-]{43}$/;
export const PREFIX_LEN = 8;

// read — סטטיסטיקה, רשימות וייצוא; import — העלאת חבילות וסנכרון; review — הכרעות, אישור/דחייה, דיווחים, ההנחיות.
export const SCOPES = Object.freeze(['read', 'review', 'import']);
export const SCOPE_LABELS = Object.freeze({
  read: 'קריאה — סטטיסטיקה, הגשות, דיווחים וייצוא',
  review: 'הכרעה — החלטות נוסח, אישור ודחייה של הגשות, דיווחים והנחיות',
  import: 'ייבוא — העלאת חבילות מסכת וסנכרון סטטוסים',
});
export const SCOPE_SHORT = Object.freeze({ read: 'קריאה', review: 'הכרעה', import: 'ייבוא' });

export const MAX_NAME = 60;
export const DEFAULT_DAYS = 180;
export const MAX_DAYS = 365;
export const MAX_ACTIVE = 5;
export const TOUCH_MS = 60 * 1000;
export const VIA_SUFFIX = ' (צורת הדף)';

export const STATE_LABELS = Object.freeze({ active: 'פעיל', revoked: 'בוטל', expired: 'פג תוקף' });

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- הבקשה ----------

export const TOKEN_API_BASE = '/api/admin/tzurat-hadaf';
const TOKENS_ADMIN = `${TOKEN_API_BASE}/tokens`;

const under = (path, base) => path === base || path.startsWith(`${base}/`);

// נתיב שהראוט שלו עשוי לקבל מפתח (חוץ מניהול המפתחות עצמו)
export function acceptsTokenPath(path) {
  const p = String(path || '');
  return under(p, TOKEN_API_BASE) && !under(p, TOKENS_ADMIN);
}

// כותרת Authorization ← המפתח שהוצג, '' (Bearer פגום), או null (אין Bearer)
export function bearerOf(header) {
  if (typeof header !== 'string') return null;
  const h = header.trim();
  if (!/^bearer(\s|$)/i.test(h)) return null;
  const parts = h.split(/\s+/);
  return parts.length === 2 ? parts[1] : '';
}

// ה-proxy מעביר בקשה בלי session לראוט רק כשהיא נושאת מפתח tht_ ולנתיב שמקבל מפתח
export function proxyLetsBearerThrough(path, header) {
  const presented = bearerOf(header);
  return !!presented && presented.startsWith(TOKEN_PREFIX) && acceptsTokenPath(path);
}

export const isTokenFormat = (value) => typeof value === 'string' && TOKEN_RE.test(value);
export const tokenPrefixOf = (value) => String(value).slice(0, PREFIX_LEN);

// ---------- יצירה ----------

export function normalizeScopes(input) {
  if (!Array.isArray(input)) return { error: 'רשימת הרשאות לא תקינה' };
  const set = new Set();
  for (const s of input) {
    if (!SCOPES.includes(s)) return { error: `הרשאה לא מוכרת: ${String(s).slice(0, 20)}` };
    set.add(s);
  }
  const scopes = SCOPES.filter((s) => set.has(s));
  if (!scopes.length) return { error: 'יש לבחור לפחות הרשאה אחת' };
  return { scopes };
}

export function validDays(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= 1 && n <= MAX_DAYS ? n : null;
}

const noControl = (s) => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('');

export function parseCreateInput(body, now = new Date()) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const name = typeof b.name === 'string' ? noControl(b.name).trim() : '';
  if (!name) return { error: 'יש לתת שם למפתח (למשל "צורת הדף — שרת הבנייה")' };
  if (name.length > MAX_NAME) return { error: `שם המפתח ארוך מדי (עד ${MAX_NAME} תווים)` };
  let days = DEFAULT_DAYS;
  if (b.days !== undefined && b.days !== null && b.days !== '') {
    days = validDays(b.days);
    if (days === null) return { error: `תוקף המפתח: מספר ימים שלם בין 1 ל-${MAX_DAYS}` };
  }
  let scopes = [...SCOPES];
  if (b.scopes !== undefined) {
    const r = normalizeScopes(b.scopes);
    if (r.error) return { error: r.error };
    scopes = r.scopes;
  }
  return { name, scopes, days, expiresAt: new Date(now.getTime() + days * DAY_MS) };
}

// ---------- מצב ושימוש ----------

const timeOf = (d) => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
};

export function tokenState(doc, now = new Date()) {
  if (doc?.revokedAt) return 'revoked';
  const exp = timeOf(doc?.expiresAt);
  if (!Number.isFinite(exp) || exp <= now.getTime()) return 'expired';
  return 'active';
}

export const activeFilter = (userId, now = new Date()) => ({ user: userId, revokedAt: null, expiresAt: { $gt: now } });

export function missingScope(tokenScopes, required) {
  const have = new Set(Array.isArray(tokenScopes) ? tokenScopes : []);
  const need = Array.isArray(required) ? required : [required];
  return need.find((s) => !have.has(s)) ?? null;
}

export function shouldTouch(lastUsedAt, now = new Date()) {
  const t = timeOf(lastUsedAt);
  return !Number.isFinite(t) || now.getTime() - t >= TOUCH_MS;
}

export function publicToken(doc, now = new Date()) {
  return {
    id: String(doc._id),
    name: doc.name || '',
    prefix: doc.prefix || '',
    scopes: SCOPES.filter((s) => (doc.scopes || []).includes(s)),
    createdAt: doc.createdAt ?? null,
    expiresAt: doc.expiresAt ?? null,
    lastUsedAt: doc.lastUsedAt ?? null,
    revokedAt: doc.revokedAt ?? null,
    state: tokenState(doc, now),
  };
}

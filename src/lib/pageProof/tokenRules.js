// מפתחות-גישה לתוכנת-הספר (הגהת-העמודים) — הכללים הטהורים: הצורה, ההרשאות, התוקף, מה
// מוצג, ואילו בקשות/נתיבים נחשבים "עם מפתח". בלי מסד ובלי crypto — כדי שגם ה-proxy
// (src/proxy.js) וגם מסך הניהול (בדפדפן) יוכלו לייבא אותו. יצירה וגיבוב: tokenSecret.js;
// האימות בבקשה: tokenAuth.js; המודל: models/PageProofToken.js; הראוטים: api/admin/page-proof/tokens.
//
// המפתח = "ppt_" + 32 בתים אקראיים (base64url, 43 תווים), ומוצג פעם אחת, ביצירה. במסד נשמרים
// רק ה-SHA-256 שלו ו-8 התווים הראשונים (prefix) לזיהוי ברשימה.

// "page-proof token" — כך רואים מיד מה זה, וסורקי-סודות יכולים לזהות אותו
export const TOKEN_PREFIX = 'ppt_';
export const TOKEN_RE = /^ppt_[A-Za-z0-9_-]{43}$/;
export const PREFIX_LEN = 8;

// הרשאות: read — ספרים, עמודים, הגשות, תיקונים; review — אישור/דחייה/שחרור ממתנה
// לזיהוי-מחדש, שחרור תפיסות, סימון תיקונים שיצאו; import — ייבוא חבילות-עמודים
export const SCOPES = Object.freeze(['read', 'review', 'import']);
export const SCOPE_LABELS = Object.freeze({
  read: 'קריאה — ספרים, עמודים, הגשות ותיקונים',
  review: 'אישור ודחייה — הגשות, שחרור ממתנה, שחרור תפיסות, סימון תיקונים שיצאו',
  import: 'ייבוא חבילות-עמודים (כולל גרסה חדשה לעמוד שחזר מזיהוי-מחדש)',
});
export const SCOPE_SHORT = Object.freeze({ read: 'קריאה', review: 'אישור ודחייה', import: 'ייבוא' });

export const MAX_NAME = 60;
export const DEFAULT_DAYS = 180;
export const MAX_DAYS = 365;
// מפתחות פעילים (לא בוטלו ולא פגו) למשתמש אחד
export const MAX_ACTIVE = 5;
// lastUsedAt מתעדכן לכל היותר פעם בדקה — לא כתיבה למסד בכל בקשה
export const TOUCH_MS = 60 * 1000;
// שם-המשתמש בפעולות שנעשו במפתח (reviewedByName וכו') — שיהיה ברור מאיפה באו
export const VIA_SUFFIX = ' (תוכנת-הספר)';

export const STATE_LABELS = Object.freeze({ active: 'פעיל', revoked: 'בוטל', expired: 'פג תוקף' });

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- הבקשה ----------

// הנתיבים שמקבלים מפתח. ניהול המפתחות עצמו (tokens/) — רק session, לעולם לא במפתח.
export const TOKEN_API_BASE = '/api/admin/page-proof';
const TOKENS_ADMIN = `${TOKEN_API_BASE}/tokens`;

const under = (path, base) => path === base || path.startsWith(`${base}/`);

// נתיב שהראוט שלו עשוי לקבל מפתח (הראוט עצמו מחליט לכל שיטה ולכל הרשאה — tokenAuth).
// כל השאר (כולל ניהול המפתחות) — לא.
export function acceptsTokenPath(path) {
  const p = String(path || '');
  return under(p, TOKEN_API_BASE) && !under(p, TOKENS_ADMIN);
}

// כותרת Authorization ← המפתח שהוצג, '' (Bearer בלי ערך תקין — ניסיון שגוי), או null
// (אין Bearer בכלל: אין כותרת, או סכמה אחרת — אז ה-session הרגיל קובע)
export function bearerOf(header) {
  if (typeof header !== 'string') return null;
  const h = header.trim();
  if (!/^bearer(\s|$)/i.test(h)) return null;
  const parts = h.split(/\s+/);
  return parts.length === 2 ? parts[1] : '';
}

// ה-proxy מעביר בקשה בלי session לראוט רק כשהיא נושאת מפתח שלנו, ורק לנתיבים שמקבלים
// מפתח — שם הראוט בודק אותו. אחרת (למשל Bearer לנתיב אחר) — ההתנהגות הקיימת: הפניה להתחברות.
export function proxyLetsBearerThrough(path, header) {
  const presented = bearerOf(header);
  return !!presented && presented.startsWith(TOKEN_PREFIX) && acceptsTokenPath(path);
}

export const isTokenFormat = (value) => typeof value === 'string' && TOKEN_RE.test(value);

export const tokenPrefixOf = (value) => String(value).slice(0, PREFIX_LEN);

// ---------- יצירה ----------

// הרשאות מבקשת-היצירה ← {scopes} (בסדר הקבוע, בלי כפילויות) או {error}
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

// תוקף בימים ← מספר שלם בין 1 ל-MAX_DAYS, או null
export function validDays(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= 1 && n <= MAX_DAYS ? n : null;
}

// תווי-בקרה (שורה חדשה, טאב…) בשם ← רווח
const noControl = (s) => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('');

// גוף בקשת-היצירה {name, days?, scopes?} ← {name, scopes, days, expiresAt} או {error}.
// days חסר ← 180; scopes חסר ← כל ההרשאות.
export function parseCreateInput(body, now = new Date()) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const name = typeof b.name === 'string' ? noControl(b.name).trim() : '';
  if (!name) return { error: 'יש לתת שם למפתח (למשל "תוכנת-הספר — המחשב בבית")' };
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

// 'active' | 'revoked' | 'expired'
export function tokenState(doc, now = new Date()) {
  if (doc?.revokedAt) return 'revoked';
  const exp = timeOf(doc?.expiresAt);
  if (!Number.isFinite(exp) || exp <= now.getTime()) return 'expired';
  return 'active';
}

// מסנן-Mongo: המפתחות הפעילים של משתמש (לתקרה)
export const activeFilter = (userId, now = new Date()) => ({ user: userId, revokedAt: null, expiresAt: { $gt: now } });

// ההרשאה הראשונה מבין הנדרשות שאין למפתח, או null
export function missingScope(tokenScopes, required) {
  const have = new Set(Array.isArray(tokenScopes) ? tokenScopes : []);
  const need = Array.isArray(required) ? required : [required];
  return need.find((s) => !have.has(s)) ?? null;
}

// האם לעדכן lastUsedAt (עבר לפחות TOUCH_MS מאז הפעם הקודמת)
export function shouldTouch(lastUsedAt, now = new Date()) {
  const t = timeOf(lastUsedAt);
  return !Number.isFinite(t) || now.getTime() - t >= TOUCH_MS;
}

// הצורה שנשלחת לדפדפן — רשימה סגורה של שדות: לעולם לא הגיבוב, ולעולם לא המפתח עצמו
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

/**
 * טוקן GitHub של האתר: טוקן התקנה של Otzaria Bot (GitHub App) כשהוגדר, אחרת הטוקן האישי.
 * פעולות בטוקן הבוט מופיעות בשם otzaria-bot[bot], וקומיטים שנוצרים ב-API שלו מאומתים.
 */
import { createSign } from 'crypto';

const API = 'https://api.github.com';
const TIMEOUT_MS = 20_000;
// טוקן התקנה תקף שעה; מחליפים אותו לפני שיפוג באמצע רצף קריאות
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

/** הגדרות ה-App מ-env, או null. מפתח עם \n מילוליים (שורה אחת ב-.env) מתורגם לשורות. */
export function getBotAppConfig(env = process.env) {
  const appId = (env.GITHUB_APP_ID || '').trim();
  const privateKey = (env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  return appId && privateKey ? { appId, privateKey } : null;
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** JWT של ה-App (RS256), תקף 9 דקות; iat אחורה בדקה בגלל סטיית שעון. */
export function createAppJwt({ appId, privateKey }, nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iat: now - 60, exp: now + 540, iss: appId })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

async function appFetch(path, { jwt, method = 'GET', fetchImpl }) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'otzaria-bot',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`GitHub App ${method} ${path} → ${res.status}${data?.message ? `: ${data.message}` : ''}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** הבעלים (ארגון או משתמש) מתוך כתובת API של ריפו, או מ-"owner/repo". */
export function ownerOf(urlOrRepo) {
  const s = String(urlOrRepo || '');
  const m = s.match(/\/repos\/([^/]+)\//) || s.match(/^([^/:]+)\/[^/]+$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * ספק טוקנים לבוט: פונקציה (urlOrRepo) => Promise<string>, עם טוקן התקנה שמור לכל בעלים.
 * @param {{appId:string, privateKey:string}} app
 * @param {{fetchImpl?:typeof fetch, now?:() => number}} [opts]
 */
export function createBotTokenProvider(app, { fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const provider = async (urlOrRepo) => {
    const owner = ownerOf(urlOrRepo) || 'Otzaria';
    const hit = cache.get(owner);
    if (hit && hit.expiresAt - REFRESH_MARGIN_MS > now()) return hit.token;
    const pending = (async () => {
      const jwt = createAppJwt(app, now());
      const inst = await appFetch(`/users/${encodeURIComponent(owner)}/installation`, { jwt, fetchImpl });
      const t = await appFetch(`/app/installations/${inst.id}/access_tokens`, { jwt, method: 'POST', fetchImpl });
      return { token: t.token, expiresAt: Date.parse(t.expires_at) || now() + 3_600_000 };
    })();
    // קריאות מקבילות מחכות לאותה בקשה; כשל לא נשמר
    const waiting = pending.then((v) => v.token);
    waiting.catch(() => {}); // הכשל נזרק לקורא הראשון; בלי זה הוא גם unhandledRejection
    cache.set(owner, { token: waiting, expiresAt: Infinity });
    try {
      const fresh = await pending;
      cache.set(owner, fresh);
      return fresh.token;
    } catch (err) {
      cache.delete(owner);
      throw err;
    }
  };
  provider.isBot = true;
  provider.identity = async () => {
    const appInfo = await appFetch('/app', { jwt: createAppJwt(app, now()), fetchImpl });
    const login = `${appInfo.slug}[bot]`;
    // JWT של App תקף רק תחת /app; פרופיל המשתמש ציבורי
    const user = await appFetch(`/users/${encodeURIComponent(login)}`, { jwt: null, fetchImpl });
    return { login, name: appInfo.name || login, email: `${user.id}+${login}@users.noreply.github.com` };
  };
  return provider;
}

let shared = null;

/**
 * הטוקן לכל קריאות ה-GitHub של האתר: ספק הבוט כשהוגדר ב-env, אחרת DICTA_LIBRARY_GITHUB_TOKEN, אחרת null.
 * @returns {string | ((urlOrRepo:string) => Promise<string>) | null}
 */
export function getGithubToken(env = process.env) {
  const app = getBotAppConfig(env);
  if (app) {
    if (!shared || shared.key !== `${app.appId}\n${app.privateKey}`) {
      shared = { key: `${app.appId}\n${app.privateKey}`, provider: createBotTokenProvider(app) };
    }
    return shared.provider;
  }
  return (env.DICTA_LIBRARY_GITHUB_TOKEN || '').trim() || null;
}

/** ערך טוקן לכותרת Authorization: מחרוזת כמות שהיא, ספק — לפי הבעלים של הכתובת. */
export async function resolveGithubToken(token, urlOrRepo) {
  return typeof token === 'function' ? token(urlOrRepo) : token;
}

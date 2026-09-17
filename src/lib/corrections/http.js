/**
 * שער ה-API של המתנדבים: session + טעינת המשתמש מה-DB בכל בקשה (לא סומכים על
 * ה-JWT להרשאה), ובדיקת Origin/Sec-Fetch-Site לבקשות משנות (הגנת CSRF לעוגיות next-auth).
 */
import User from '../../models/User.js';
import { loadCorrectionsConfig } from './runtime.js';

const NO_STORE = { 'cache-control': 'private, no-store' };
export const jsonResponse = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

/** @returns {{ok:true}|{ok:false, reason:string}} */
export function checkSameOrigin(request, env = process.env) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return { ok: false, reason: 'cross_site' };
  const origin = request.headers.get('origin');
  if (!origin) return site === 'same-origin' ? { ok: true } : { ok: false, reason: 'origin_missing' };
  const allowed = new Set();
  try { allowed.add(new URL(request.url).origin); } catch { /* ignore */ }
  if (env.NEXTAUTH_URL) {
    try { allowed.add(new URL(env.NEXTAUTH_URL).origin); } catch { /* ignore */ }
  }
  return allowed.has(origin) ? { ok: true } : { ok: false, reason: 'origin_mismatch' };
}

/**
 * @param {Request} request
 * @param {(ctx:{user:object, config:object})=>Promise<{status:number, body:any, headers?:object}>} fn
 * @param {{getSession:Function, connect:Function, mutate?:boolean}} opts
 */
export async function handleCorrectionsRequest(request, fn, { getSession, connect, mutate = false }) {
  if (mutate) {
    const o = checkSameOrigin(request);
    if (!o.ok) return jsonResponse({ error: 'csrf_rejected', reason: o.reason }, 403);
  }
  const session = await getSession();
  if (!session?.user?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
  try {
    await connect();
    const user = await User.findById(session.user.id).select('name role isSupervisor isCorrectionsVolunteer').lean();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const config = await loadCorrectionsConfig();
    const result = await fn({ user, config });
    return jsonResponse(result.body, result.status, result.headers);
  } catch (err) {
    console.error('[corrections-api] failed:', err?.message);
    return jsonResponse({ error: 'server_error' }, 500);
  }
}

export async function readJson(request, maxBytes = 128 * 1024) {
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error('too large'), { status: 413 });
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error('bad json'), { status: 400 });
  }
}

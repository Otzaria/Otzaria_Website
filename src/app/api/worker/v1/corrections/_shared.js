// תגובות HTTP ועטיפת אימות לראוטי /api/worker/v1/corrections — שירות הבדיקה במצב משיכה
// (docs/text-corrections/CONTRACT.md §3.7). כל תגובה JSON עם no-store (חוץ מ-204), בלי redirects,
// ושגיאה היא {"error":"<code>"} בלבד. שבת/יו"ט: 503 משער ה-proxy, לפני הראוט.
import connectDB from '@/lib/db';
import { getCorrectionsConfig } from '@/lib/corrections/config';
import { loadCorrectionsConfig } from '@/lib/corrections/runtime';
import { authenticateAgent, agentVersionOf, createRejectLogger } from '@/lib/corrections/agent-auth';
import { recordAgentSeen } from '@/lib/corrections/agent';
import { restGate } from '@/lib/corrections/rest-gate';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const logRejected = createRejectLogger();

export function agentJson(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, ...JSON_HEADERS } });
}

export function agentError(status, code, extra = {}, headers = {}) {
  const h = { ...headers };
  if (status === 401) h['WWW-Authenticate'] = 'Bearer realm="otzaria-corrections-agent"';
  return agentJson(status, { ...extra, error: code }, h);
}

/** תוצאת כשל מהשכבה (agent.js) → תגובה; Retry-After רק כשנקבע (503 apply_in_progress). */
export function agentFailure(r) {
  return agentError(r.status, r.code, r.reason ? { reason: r.reason } : {}, r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : {});
}

export const agentNoContent = (retryAfter) => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } });

/**
 * גוף JSON עם תקרת בתים, בלי לצבור יותר מהתקרה בזיכרון. raw — הבתים כפי שהתקבלו (ל-sha256).
 * allowEmpty: גוף ריק = {} (גוף אופציונלי, למשל ב-release).
 * @returns {Promise<{ok:true, raw:Buffer, body:any} | {ok:false, status:number, code:string}>}
 */
export async function readAgentBody(request, maxBytes, { allowEmpty = false } = {}) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413, code: 'payload_too_large' };
  const chunks = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, code: 'payload_too_large' };
      }
      chunks.push(value);
    }
  }
  const raw = Buffer.concat(chunks);
  if (allowEmpty && raw.length === 0) return { ok: true, raw, body: {} };
  try {
    return { ok: true, raw, body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) };
  } catch {
    return { ok: false, status: 400, code: 'bad_request' };
  }
}

// handler(request, { agentId, config, params }). חריגה → 500 internal_error בלי טקסט החריגה; הלוג
// מינימלי בכוונה (name/code ונתיב בלבד — message/stack עלולים להכיל תוכן בקשה או סודות).
export function withAgent(handler) {
  return async (request, routeCtx) => {
    let route = '?';
    try {
      route = new URL(request.url).pathname;
    } catch {
      // URL לא תקין — נשאר '?'
    }
    try {
      // שבת/יו"ט — לפני הכל, אופליין ונכשל-סגור (גם אם שער ה-proxy נעקף או ש-Hebcal לא זמין).
      const rest = restGate(new Date());
      if (rest.closed) return agentError(503, 'shabbat', {}, { 'Retry-After': String(rest.retryAfter) });
      // האימות לפני כל גישה למסד: env בלבד (מתגי המסך אינם משפיעים על הזהות).
      const auth = authenticateAgent(request, getCorrectionsConfig(process.env).verify);
      if (!auth.ok) {
        logRejected(auth.code);
        return agentError(auth.status, auth.code);
      }
      await connectDB();
      try {
        await recordAgentSeen({ agentId: auth.agentId, route: `${request.method} ${route}`, version: agentVersionOf(request) });
      } catch {
        console.warn('[corrections-agent] last-seen update failed');
      }
      const config = await loadCorrectionsConfig();
      const params = routeCtx?.params ? await routeCtx.params : {};
      return await handler(request, { agentId: auth.agentId, config, params });
    } catch (err) {
      console.error(`[corrections-agent] internal error route=${route} name=${String(err?.name ?? 'unknown')} code=${String(err?.code ?? '-')}`);
      return agentError(500, 'internal_error');
    }
  };
}

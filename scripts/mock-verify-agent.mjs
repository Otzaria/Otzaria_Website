#!/usr/bin/env node
/**
 * סוכן בדיקה מדומה במצב משיכה — לפיתוח בלבד (מסרב לרוץ ב-NODE_ENV=production).
 * אין בו לוגיקת הכרעה: הוא תופס משימות מ-/api/worker/v1/corrections ומוסר החלטה שנקבעה בהגדרה
 * (תשובה תקינה לפי CONTRACT §3.2) — המקביל של scripts/mock-verify-server.mjs במצב דחיפה.
 *
 * הרצה: node scripts/mock-verify-agent.mjs [--once] [--allow-remote]
 * מסרב לכתובת שאינה localhost בלי --allow-remote: החלטות הדמה היו מתקבלות שם כאמיתיות.
 * env: CORRECTIONS_AGENT_SECRET, CORRECTIONS_AGENT_ID (חובה, זהים לאתר; נטענים גם מ-.env),
 *      MOCK_AGENT_SITE (http://127.0.0.1:3000),
 *      MOCK_AGENT_DECISION (approved; רשימה מופרדת בפסיקים = לפי הסדר, במחזוריות),
 *      MOCK_AGENT_SCOPE (technical_only), MOCK_AGENT_WORK_SECONDS (0 — "עבודה" עם דופק כל 60 שניות),
 *      MOCK_AGENT_MODE (sync | abandon — תופס ולא עונה | invalid — תשובה פגומה | capacity — service_capacity)
 * באתר: CORRECTIONS_VERIFY_ENABLED=1 CORRECTIONS_VERIFY_TRANSPORT=pull CORRECTIONS_AGENT_SECRET=… CORRECTIONS_AGENT_ID=…
 */
import { buildMockDecision } from '../src/lib/corrections/testing/mock-verify.js';

try { (await import('dotenv')).config(); } catch { /* dotenv אופציונלי */ }
if (process.env.NODE_ENV === 'production') {
  console.error('mock-verify-agent: אסור להריץ בייצור');
  process.exit(2);
}
const secret = process.env.CORRECTIONS_AGENT_SECRET?.trim();
const agentId = process.env.CORRECTIONS_AGENT_ID?.trim();
if (!secret || !agentId) {
  console.error('mock-verify-agent: CORRECTIONS_AGENT_SECRET / CORRECTIONS_AGENT_ID חסרים');
  process.exit(2);
}
const DECISIONS = ['approved', 'rejected', 'needs_review', 'conflict', 'already_fixed'];
const MODES = ['sync', 'abandon', 'invalid', 'capacity'];
const site = (process.env.MOCK_AGENT_SITE || 'http://127.0.0.1:3000').replace(/\/+$/, '');
let siteHost = '';
try {
  siteHost = new URL(site).hostname.toLowerCase().replace(/^\[|\]$/g, '');
} catch {
  console.error(`mock-verify-agent: MOCK_AGENT_SITE לא תקין: ${site}`);
  process.exit(2);
}
const isLocalSite = siteHost === 'localhost' || siteHost.endsWith('.localhost') || siteHost === '::1' || /^127\./.test(siteHost);
if (!isLocalSite && !process.argv.includes('--allow-remote')) {
  console.error(`mock-verify-agent: ${siteHost} אינו localhost — החלטות הדמה היו מתקבלות שם כאמיתיות. להרצה מכוונת: --allow-remote`);
  process.exit(2);
}
const decisions = (process.env.MOCK_AGENT_DECISION || 'approved').split(',').map((d) => d.trim()).filter(Boolean);
const scope = process.env.MOCK_AGENT_SCOPE || 'technical_only';
const mode = process.env.MOCK_AGENT_MODE || 'sync';
const workSeconds = Math.max(0, Number(process.env.MOCK_AGENT_WORK_SECONDS) || 0);
const BEAT_SECONDS = 60;
const MAX_WAIT_SECONDS = 3600;
if (!decisions.length || decisions.some((d) => !DECISIONS.includes(d)) || !MODES.includes(mode)) {
  console.error(`mock-verify-agent: MOCK_AGENT_DECISION ∈ ${DECISIONS.join('|')}, MOCK_AGENT_MODE ∈ ${MODES.join('|')}`);
  process.exit(2);
}
const once = process.argv.includes('--once');
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; });

const sleep = async (seconds) => {
  const until = Date.now() + seconds * 1000;
  while (!stopping && Date.now() < until) await new Promise((r) => setTimeout(r, Math.min(500, until - Date.now())));
};

async function post(path, { body, leaseToken } = {}) {
  const res = await fetch(`${site}/api/worker/v1/corrections${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`, 'x-agent-id': agentId, 'x-agent-version': 'mock-agent',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(leaseToken ? { 'x-lease-token': leaseToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  const retryAfter = Number.parseInt(res.headers.get('retry-after') || '', 10);
  return { status: res.status, json, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null };
}

let seq = 0;
function resultBody(request) {
  if (mode === 'invalid') return { ...buildMockDecision(request), decision: 'maybe' };
  if (mode === 'capacity') {
    return { api_version: '1', request_id: request.request_id, processing_status: 'failed', reason_code: 'service_capacity', retry_after_seconds: 60 };
  }
  return buildMockDecision(request, { decision: decisions[seq++ % decisions.length], scope });
}

/** תפיסה אחת ומסירת התוצאה. מחזיר כמה שניות להמתין לפני התפיסה הבאה. */
async function tick() {
  const claim = await post('/claim');
  if (claim.status === 204) return claim.retryAfter ?? 60;
  if (claim.status !== 200) {
    console.error(`[mock-agent] claim ${claim.status} ${JSON.stringify(claim.json)}`);
    return claim.retryAfter ?? 60;
  }
  const { jobId, leaseToken, leaseExpiresAt, request } = claim.json;
  console.log(`[mock-agent] claimed ${jobId} report=${request.report_id} rev=${request.proposal_revision} lease→${leaseExpiresAt} diff=${request.diff ? 'yes' : 'null'}`);
  if (mode === 'abandon') {
    console.log('[mock-agent] abandon: אין תשובה — ה-lease יפוג והמשימה תיתפס שוב (נספרת כפקיעה)');
    return 0;
  }
  for (let left = workSeconds; left > 0 && !stopping; left -= BEAT_SECONDS) {
    await sleep(Math.min(BEAT_SECONDS, left));
    const beat = await post(`/${jobId}/heartbeat`, { leaseToken });
    console.log(`[mock-agent] heartbeat ${beat.status} ${JSON.stringify(beat.json)}`);
    if (beat.status !== 200 || beat.json?.cancelled) return 0;
  }
  const body = resultBody(request);
  // שליחה חוזרת של אותו גוף בדיוק בתקלה זמנית — האתר מזהה אותו ואינו מחיל פעמיים.
  for (let attempt = 1; ; attempt++) {
    const res = await post(`/${jobId}/result`, { body, leaseToken });
    console.log(`[mock-agent] result ${res.status} ${JSON.stringify(res.json)}`);
    if (res.status < 500) return 0;
    if (attempt >= 5 || stopping) return 60;
    await sleep(Math.min(res.retryAfter ?? 10, MAX_WAIT_SECONDS));
  }
}

console.log(`[mock-agent] ${site} agent=${agentId} decisions=${decisions.join(',')} scope=${scope} mode=${mode} work=${workSeconds}s`);
if (once) {
  try {
    await tick();
  } catch (err) {
    console.error(`[mock-agent] request failed: ${err?.message}`);
    process.exit(1);
  }
  process.exit(0);
}
while (!stopping) {
  let wait;
  try {
    wait = await tick();
  } catch (err) {
    console.error(`[mock-agent] request failed: ${err?.message}`);
    wait = 30;
  }
  await sleep(Math.min(wait, MAX_WAIT_SECONDS));
}
console.log('[mock-agent] stopped');

#!/usr/bin/env node
/**
 * שרת דמה לשירות הבדיקה — לפיתוח בלבד (מסרב לרוץ ב-NODE_ENV=production).
 * אין בו לוגיקת הכרעה: ההחלטה נקבעת בהגדרה, והוא רק מחזיר תשובה תקינה לפי CONTRACT §3.
 *
 * הרצה: node scripts/mock-verify-server.mjs
 * env: MOCK_VERIFY_PORT (4555), MOCK_VERIFY_SECRET (חובה), MOCK_VERIFY_DECISION (approved),
 *      MOCK_VERIFY_SCOPE (technical_only), MOCK_VERIFY_MODE (sync|async|fail503|fail401|garbage)
 * באתר: CORRECTIONS_VERIFY_URL=http://127.0.0.1:4555 CORRECTIONS_VERIFY_MOCK=1
 */
import http from 'node:http';
import { buildMockDecision } from '../src/lib/corrections/testing/mock-verify.js';

if (process.env.NODE_ENV === 'production') {
  console.error('mock-verify-server: אסור להריץ בייצור');
  process.exit(2);
}
const port = Number(process.env.MOCK_VERIFY_PORT) || 4555;
const secret = process.env.MOCK_VERIFY_SECRET;
if (!secret) {
  console.error('mock-verify-server: MOCK_VERIFY_SECRET חסר');
  process.exit(2);
}
const decision = process.env.MOCK_VERIFY_DECISION || 'approved';
const scope = process.env.MOCK_VERIFY_SCOPE || 'technical_only';
const mode = process.env.MOCK_VERIFY_MODE || 'sync';
const pending = new Map();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'unauthorized' });
  const poll = req.url.match(/^\/v1\/verify\/([A-Za-z0-9_.:-]+)$/);
  if (req.method === 'GET' && poll) {
    const r = pending.get(poll[1]);
    if (!r) return send(res, 404, { error: 'unknown job' });
    pending.delete(poll[1]);
    return send(res, 200, buildMockDecision(r, { decision, scope }));
  }
  if (req.method !== 'POST' || req.url !== '/v1/verify') return send(res, 404, { error: 'not found' });
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'bad json' }); }
    console.log(`[mock-verify] ${body.request_id} report=${body.report_id} rev=${body.proposal_revision} mode=${mode}`);
    if (body.diff?.unified) console.log(`[mock-verify] diff (context_lines=${body.diff.context_lines}):\n${body.diff.unified}`);
    else console.log('[mock-verify] diff: null');
    if (mode === 'fail503') return send(res, 503, { error: 'busy' }, { 'retry-after': '30' });
    if (mode === 'fail401') return send(res, 401, { error: 'unauthorized' });
    if (mode === 'garbage') return send(res, 200, '<<not json>>');
    if (mode === 'async') {
      const jobId = `job_${Date.now()}`;
      pending.set(jobId, body);
      return send(res, 202, { api_version: '1', request_id: body.request_id, processing_status: 'pending', job_id: jobId, poll_after_seconds: 5 });
    }
    return send(res, 200, buildMockDecision(body, { decision, scope }));
  });
}).listen(port, '127.0.0.1', () => console.log(`[mock-verify] listening on http://127.0.0.1:${port} (decision=${decision}, scope=${scope}, mode=${mode})`));

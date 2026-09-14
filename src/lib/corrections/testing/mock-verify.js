/**
 * שירות בדיקה מדומה — לפיתוח ולבדיקות בלבד. אינו מממש שום לוגיקת הכרעה: ההחלטה
 * נקבעת מבחוץ (תסריט), והוא רק מרכיב תשובה תקינה לפי החוזה (§3.2).
 */
import { computeChangeDigest } from '../ocj1.js';

let seq = 0;

/** מרכיב תשובת 200 תקינה לבקשה, עם החלטה שנקבעה ע"י הקורא. */
export function buildMockDecision(req, { decision = 'approved', scope = 'technical_only', reasonCode = 'ok', newLine, generation, message = 'mock' } = {}) {
  const p = req.proposal;
  const s = req.source;
  const target = newLine ?? (p.proposed_text === null ? null : p.original_selection === null ? p.proposed_text : p.context_before + p.proposed_text + p.context_after);
  let change = null;
  if ((decision === 'approved' || decision === 'already_fixed') && s && target !== null) {
    const c = { path: s.path, base_blob_sha: s.blob_sha, line_index: s.line_index, original_line: s.current_line, new_line: target };
    change = {
      change_id: `chg_mock_${++seq}`, change_digest: computeChangeDigest(c),
      target: { repo: s.repo, path: s.path, line_index: s.line_index }, base: { commit_sha: s.commit_sha, blob_sha: s.blob_sha },
      original_line: s.current_line, new_line: target,
    };
  }
  return {
    api_version: '1', request_id: req.request_id, report_id: req.report_id, proposal_revision: req.proposal_revision,
    workflow_generation: generation ?? req.workflow_generation, decision_id: `dec_mock_${++seq}`, processing_status: 'completed',
    decision, approval_scope: decision === 'approved' ? scope : null, reason_code: reasonCode, message, change, candidates: [], retry_after_seconds: null,
  };
}

/**
 * fetch מדומה לשירות. script(req, ctx) מחזיר {status, body, headers} או זורק שגיאת רשת.
 * ctx.calls שומר את כל הבקשות (כולל כותרות) לבדיקה.
 */
export function createMockVerifyFetch(script) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    const call = { method: init.method || 'GET', path: u.pathname, headers, body, redirect: init.redirect };
    calls.push(call);
    const out = await script(call, { calls, signal: init.signal });
    return new Response(typeof out.body === 'string' ? out.body : JSON.stringify(out.body ?? {}), {
      status: out.status ?? 200, headers: { 'content-type': 'application/json', ...(out.headers || {}) },
    });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

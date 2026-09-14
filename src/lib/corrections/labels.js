/**
 * תוויות מצב בולטות לממשק המתנדבים (טהור, משותף לרשימה ולדף הדיווח).
 */
import { isFinalState } from './states.js';

const RETRY_EXHAUSTED = new Set(['retries_exhausted', 'deadline_exhausted']);
const NOT_CONFIGURED = new Set(['service_disabled', 'service_not_configured', 'service_misconfigured', 'service_secret_missing', 'mock_forbidden_in_production', 'service_paused']);
const CONFLICT = new Set(['source_changed', 'service_conflict', 'source_changed_after_approval', 'source_ambiguous']);

/** @returns {Array<{id:string, text:string, tone:'info'|'warn'|'danger'|'success'}>} */
export function deriveLabels(r) {
  const out = [];
  const add = (id, text, tone) => out.push({ id, text, tone });
  const handoff = r.manual?.handoffReason;
  const v = r.verification || {};
  const pub = r.publish || {};
  const appr = r.approval || {};

  if (appr.authority === 'service' && appr.scope === 'technical_only') add('technical_only', 'אושר טכנית בלבד', 'info');
  if (handoff === 'needs_content_review') add('needs_content', 'נדרש אישור תוכן', 'warn');
  if (NOT_CONFIGURED.has(handoff) || v.status === 'skipped_service_disabled') add('service_off', 'השירות אינו מוגדר', 'info');
  if (v.status === 'queued' && v.attempts > 0) add('retry_wait', 'ממתין לניסיון חוזר', 'warn');
  if (RETRY_EXHAUSTED.has(handoff)) add('exhausted', 'מוצו הניסיונות', 'danger');
  if (CONFLICT.has(handoff) || pub.conflictReason) add('conflict', 'התנגשות', 'danger');
  if (appr.authority && appr.authority !== 'none' && appr.scope === 'technical_and_content' && ['ready', 'in_progress'].includes(pub.status)) {
    add('approved_pending_publish', 'אושר וממתין לפרסום', 'info');
  }
  if (pub.status === 'failed') add('publish_failed', 'פרסום נכשל', 'danger');
  if (pub.status === 'unknown_needs_reconcile') add('publish_unknown', 'תוצאת פרסום לא ידועה ונבדקת', 'warn');
  if (pub.status === 'pr_opened') add('pr_opened', 'נפתח PR (טרם מוזג)', 'info');
  if (pub.status === 'committed' || r.state === 'closed_published') add('published', 'פורסם במקור', 'success');
  if (pub.status === 'skipped_already_fixed' || r.state === 'closed_already_fixed') add('already_fixed', 'כבר תוקן במקור', 'success');
  if (r.inclusion?.status === 'included_in_release') add('in_release', 'נכלל בגרסת ספרייה', 'success');
  if (r.state === 'closed_rejected') add('rejected', 'נדחה', 'danger');
  if (!isFinalState(r.state) && r.resolvedSource?.status === 'already_applied') add('looks_fixed', 'נראה שכבר תוקן במקור', 'info');
  return out;
}

/**
 * מצבי מערכת התיקונים (CONTRACT §5.2) — מופרדים, לא enum יחיד.
 * מעברים מתבצעים רק בעדכון אטומי מותנה-גרסה (ראו store.js).
 */

export const VERIFICATION_STATUS = ['not_requested', 'queued', 'in_progress', 'completed', 'failed', 'superseded', 'skipped_service_disabled'];
export const APPROVAL_AUTHORITY = ['none', 'service', 'volunteer'];
export const APPROVAL_SCOPE = ['none', 'technical_only', 'technical_and_content'];
export const MANUAL_STATUS = ['none', 'queued', 'claimed', 'released'];
export const PUBLISH_STATUS = ['not_ready', 'ready', 'in_progress', 'unknown_needs_reconcile', 'pr_opened', 'committed', 'failed', 'skipped_already_fixed'];
export const INCLUSION_STATUS = ['unknown', 'merged_to_main', 'included_in_release'];
// email_only: המייל אינו מגיע לתיבת אוצריא (reachesOtzariaInbox) — נשמר ונשלח כמו תמיד, בלי עיבוד.
export const REPORT_STATE = ['open', 'email_only', 'closed_published', 'closed_already_fixed', 'closed_rejected', 'closed_manual'];
export const JOB_TYPES = ['verify', 'publish'];
export const JOB_STATUS = ['pending', 'leased', 'done', 'failed', 'cancelled'];

export const isFinalState = (state) => typeof state === 'string' && state.startsWith('closed_');

/** מיפוי לשדה status הישן (תאימות למסכים/שאילתות קיימים). */
export function legacyStatusFor(state, manualStatus) {
  if (state === 'closed_rejected') return 'rejected';
  if (isFinalState(state)) return 'resolved';
  return manualStatus === 'claimed' ? 'in_progress' : 'pending';
}

/** מצב מחושב לדיווח ישן שלא עבר migration. */
export function legacyStateFromStatus(status) {
  if (status === 'resolved') return 'closed_manual';
  if (status === 'rejected') return 'closed_rejected';
  return 'open';
}

export const HANDOFF_REASON_LABELS = {
  free_text: 'דיווח חופשי',
  legacy_report: 'דיווח ישן (לפני מערכת התיקונים)',
  no_proposal: 'לא הוצע תיקון',
  service_disabled: 'השירות כבוי',
  service_not_configured: 'השירות אינו מוגדר',
  service_misconfigured: 'הגדרת השירות שגויה',
  service_secret_missing: 'חסר סוד לשירות',
  service_paused: 'השירות הושהה ע"י מנהל',
  mock_forbidden_in_production: 'שרת דמה חסום בייצור',
  retries_exhausted: 'מוצו הניסיונות',
  deadline_exhausted: 'מוצה זמן ההמתנה',
  needs_content_review: 'נדרש אישור תוכן',
  needs_review: 'השירות ביקש הכרעה אנושית',
  service_conflict: 'השירות דיווח על התנגשות',
  service_modified_proposal: 'השירות שינה את ההצעה',
  auto_publish_not_permitted: 'פרסום אוטומטי אינו מותר',
  already_fixed_unverified: 'השירות טען "כבר תוקן" ולא אומת',
  manual_reject_review: 'השירות המליץ לדחות',
  unknown_reason_code: 'קוד סיבה לא מוכר מהשירות',
  invalid_response: 'תשובה פגומה מהשירות',
  response_mismatch: 'מזהים לא תואמים בתשובה',
  source_not_found: 'המקור לא אותר',
  source_ambiguous: 'המקור עמום (כמה התאמות)',
  source_changed: 'המקור השתנה',
  manual_only_source: 'מקור שאינו ניתן לאיתור אוטומטי',
  structural_change: 'שינוי מבני',
  source_changed_after_approval: 'המקור השתנה אחרי האישור',
  publish_failed: 'הפרסום נכשל',
  worker_error: 'תקלה פנימית חוזרת בעיבוד האוטומטי',
  volunteer_released: 'שוחרר ע"י מתנדב',
  claim_expired: 'תוקף השיוך פג',
  final_state: 'הדיווח כבר סגור',
  manual_active: 'מתנדב כבר מטפל',
};

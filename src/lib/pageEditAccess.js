// כלל הגישה לצפייה בתוכן עמוד בעורך הספרים — אותו כלל כמו GET /api/page-content (שם הוא כתוב
// בתוך הראוט ולא משתנה). מודול טהור, imports יחסיים בלבד (נבדק ב-node:test).
//
//   available              — כל משתמש מחובר
//   in-progress / completed — רק מי שתפס את העמוד (claimedBy) או מנהל ספרים (hasBooksAccess)
//
// שים לב: hasBooksAccess ולא hasBookLibraryAccess — מנהל-ספרים-בלבד (admin_books_only) לא נכלל,
// בדיוק כמו בעורך עצמו.
import { hasBooksAccess } from './roles.js';

export const PAGE_IN_PROGRESS_FORBIDDEN = 'הדף נמצא בטיפול על ידי משתמש אחר';
export const PAGE_COMPLETED_FORBIDDEN = 'הדף הושלם על ידי משתמש אחר ונעול לעריכה';

/**
 * @param {{status?: string, claimedBy?: any}} page
 * @param {{_id?: any, id?: any, role?: string}|null|undefined} user session.user
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function canViewPageContent(page, user) {
  const status = page?.status;
  if (status !== 'in-progress' && status !== 'completed') return { ok: true };
  const userId = user?._id || user?.id;
  const isOwner = userId != null && page?.claimedBy != null && String(page.claimedBy) === String(userId);
  if (isOwner || hasBooksAccess(user?.role)) return { ok: true };
  return { ok: false, error: status === 'in-progress' ? PAGE_IN_PROGRESS_FORBIDDEN : PAGE_COMPLETED_FORBIDDEN };
}

export const PAGE_NOT_CLAIMED_FORBIDDEN = 'כדי לשמור תיבות לעמוד יש לתפוס אותו קודם';

/**
 * כתיבה של נתוני עמוד משותפים (תיבות שורות/מילים — PUT /api/page-layout): רק מי שתפס את העמוד
 * או מנהל ספרים (hasBooksAccess). בניגוד לצפייה — עמוד פנוי לא פתוח לכתיבה לכל משתמש מחובר.
 * @param {{status?: string, claimedBy?: any}} page
 * @param {{_id?: any, id?: any, role?: string}|null|undefined} user session.user
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function canWritePageLayout(page, user) {
  if (hasBooksAccess(user?.role)) return { ok: true };
  const userId = user?._id || user?.id;
  const isOwner = userId != null && page?.claimedBy != null && String(page.claimedBy) === String(userId);
  if (isOwner) return { ok: true };
  const view = canViewPageContent(page, user);
  return { ok: false, error: view.ok ? PAGE_NOT_CLAIMED_FORBIDDEN : view.error };
}

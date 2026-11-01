// מצב התפיסה של עמוד מנקודת המבט של המשתמש הנוכחי — לוגיקה טהורה (pageClaim.test.js).
// קובע מה יופיע בכפתור הראשי של הכותרת: "תפוס עמוד" / "סיים עמוד" / סטטוס בלבד.

/**
 * @typedef {'available'|'mine'|'other'|'completed'|'unknown'} ClaimState
 *  available — העמוד פנוי: הכפתור הראשי הוא "תפוס עמוד";
 *  mine      — העמוד תפוס על ידי המשתמש (בטיפול או שכבר סיים): "סיים עמוד";
 *  other     — בטיפול אצל מתנדב אחר (מנהל שנכנס לעמוד): סטטוס בלבד, בלי סיום;
 *  completed — הושלם על ידי מתנדב אחר: סטטוס בלבד;
 *  unknown   — אין נתוני עמוד.
 */

/**
 * @param {{ status?: string, claimedBy?: string|null, claimedById?: unknown } | null | undefined} page
 * @param {unknown} currentUserId
 * @returns {{ state: ClaimState, holderName: string|null }}
 */
export function pageClaimState(page, currentUserId) {
  if (!page || !page.status) return { state: 'unknown', holderName: null }
  if (page.status === 'available') return { state: 'available', holderName: null }

  const holderName = typeof page.claimedBy === 'string' && page.claimedBy.trim() ? page.claimedBy.trim() : null
  const mine = currentUserId != null && currentUserId !== '' && page.claimedById != null &&
    String(page.claimedById) === String(currentUserId)
  if (mine) return { state: 'mine', holderName }
  if (page.status === 'completed') return { state: 'completed', holderName }
  return { state: 'other', holderName }
}

/** האם מותר לפתוח את חלון הסיום (כפתור, Ctrl+Enter, חלון הפקודות) */
export function canFinishPage(claim) {
  return claim?.state === 'mine'
}

/** טקסט הסטטוס כשהעמוד אינו של המשתמש */
export function claimStatusText(claim) {
  if (claim?.state === 'other') return claim.holderName ? `בטיפול של ${claim.holderName}` : 'תפוס ע״י מתנדב אחר'
  if (claim?.state === 'completed') return claim.holderName ? `הושלם ע״י ${claim.holderName}` : 'העמוד הושלם'
  return ''
}

/**
 * החלטת האיחוד: תגובה על issue פתוח עם אותה חתימה, אחרת issue חדש שמפנה לסגור האחרון.
 * @param {{issueNumber:number, issueState:string|null, createdAt:Date}[]} related דיווחים עם אותה חתימה ו-issue
 * @returns {{action:'comment', issueNumber:number, issueUrl:string|null}|{action:'create', previousIssueNumber:number|null}}
 */
export function planPublication(related) {
  const sorted = [...(related || [])].filter((r) => r.issueNumber).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const open = sorted.find((r) => r.issueState === 'open');
  if (open) return { action: 'comment', issueNumber: open.issueNumber, issueUrl: open.issueUrl || null };
  return { action: 'create', previousIssueNumber: sorted[0]?.issueNumber ?? null };
}

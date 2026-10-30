/**
 * גרסת התוכנה כפי שהאפליקציה שולחת ("0.9.98+99802", "0.9.98.3+99803"). null כשאינה בפורמט הזה.
 * @returns {{core:number[], build:number|null}|null}
 */
export function parseAppVersion(version) {
  const [core, build, ...rest] = String(version ?? '').trim().split('+');
  const parts = core.split('.');
  const digits = (x) => /^\d+$/.test(x);
  if (rest.length || !parts.every(digits) || (build !== undefined && !digits(build))) return null;
  return { core: parts.map(Number), build: build === undefined ? null : Number(build) };
}

/** 1/0/-1. מספר הבנייה מכריע רק כשהגרסה שווה ולשתיהן יש מספר בנייה. */
export function compareAppVersions(a, b) {
  for (let i = 0; i < Math.max(a.core.length, b.core.length); i++) {
    const d = (a.core[i] ?? 0) - (b.core[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return a.build === null || b.build === null ? 0 : Math.sign(a.build - b.build);
}

/** חתימת תקיעה מגרסאות ישנות: רק פריימי מנוע, משותפת לתקיעות שאינן קשורות זו לזו. */
export function isGenericHangSignature(signature) {
  return signature?.exceptionType === 'AppHang'
    && (signature.frames || []).every((f) => String(f).trim().split(/\s+/).every((t) => /^flutter_windows\.dll\+/i.test(t)));
}

/**
 * החלטת האיחוד: תגובה על issue פתוח עם אותה חתימה. כשהאחרון סגור והגרסה לא חדשה מכל מה שכבר מקושר אליו —
 * צירוף שקט; אחרת (גרסה חדשה יותר = התיקון לא עזר, או גרסה לא ידועה) issue חדש שמפנה לסגור האחרון.
 * @param {{issueNumber:number, issueState:string|null, issueStateReason?:string|null, appVersion?:string, createdAt:Date}[]} related דיווחים עם אותה חתימה ו-issue
 * @param {string} [appVersion] גרסת הדיווח החדש
 * @param {{exceptionType:string, frames:string[]}|null} [signature] חתימת הדיווח החדש; תקיעה גנרית לא מצורפת בשקט
 * @returns {{action:'comment', issueNumber:number, issueUrl:string|null}
 *   |{action:'suppress', issueNumber:number, issueUrl:string|null, issueStateReason:string|null}
 *   |{action:'create', previousIssueNumber:number|null}}
 */
export function planPublication(related, appVersion, signature) {
  const sorted = [...(related || [])].filter((r) => r.issueNumber).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const open = sorted.find((r) => r.issueState === 'open');
  if (open) return { action: 'comment', issueNumber: open.issueNumber, issueUrl: open.issueUrl || null };
  const last = sorted[0];
  const version = parseAppVersion(appVersion);
  // בלי סיבת סגירה ה-issue לא נסגר ב-GitHub אלא נמחק או ננעל — אין לאן לצרף
  if (last?.issueStateReason && version && !isGenericHangSignature(signature)) {
    const linked = sorted.filter((r) => r.issueNumber === last.issueNumber);
    const highest = linked.map((r) => parseAppVersion(r.appVersion)).filter(Boolean)
      .reduce((max, v) => (!max || compareAppVersions(v, max) > 0 ? v : max), null);
    if (highest && compareAppVersions(version, highest) <= 0) {
      const withUrl = linked.find((r) => r.issueUrl);
      return { action: 'suppress', issueNumber: last.issueNumber, issueUrl: withUrl?.issueUrl || null, issueStateReason: last.issueStateReason };
    }
  }
  return { action: 'create', previousIssueNumber: last?.issueNumber ?? null };
}

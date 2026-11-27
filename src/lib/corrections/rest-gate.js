/**
 * שער שבת/יו"ט של ה-API של שירות הבדיקה (משיכה) — אופליין ונכשל-סגור. משתמש באותם חלונות מנוחה של
 * pageProof/lease.js (מיום שישי/ערב חג ב-12:00 עד מוצאי שבת/חג ב-22:00, שעון ירושלים), שגם מועד המיצוי
 * נספר מחוצה להם. אינו תלוי ב-Hebcal ואינו נעקף ב-User-Agent (בניגוד לשער ה-proxy, שנשאר בנוסף).
 */
import { restWindows } from '../pageProof/lease.js';

const HOUR_MS = 3_600_000;
// Retry-After: עד סוף החלון, אבל לא פחות מדקה ולא יותר משעה (תקרת השירות).
const retryAfterUntil = (endMs, nowMs) => Math.min(3600, Math.max(60, Math.ceil((endMs - nowMs) / 1000)));

/**
 * @param {{windows?:Function}} [opts] לבדיקות בלבד
 * @returns {{closed:false} | {closed:true, retryAfter:number}}
 */
export function restGate(now = new Date(), { windows = restWindows } = {}) {
  const t = now.getTime();
  try {
    const w = windows(t - 24 * HOUR_MS, t + 24 * HOUR_MS).find(([s, e]) => t >= s && t < e);
    return w ? { closed: true, retryAfter: retryAfterUntil(w[1], t) } : { closed: false };
  } catch {
    // לוח השנה של Intl השתנה (lease.js זורק): סגור, כמו בשבת.
    return { closed: true, retryAfter: 3600 };
  }
}

/**
 * חלון מנוחה שמתחיל בתוך withinMs הקרובים (lease שיחצה אותו לא יוכל להסתיים), או null.
 * @returns {{start:Date, end:Date, retryAfter:number} | null}
 */
export function restWindowAhead(now, withinMs, { windows = restWindows } = {}) {
  const t = now.getTime();
  try {
    const w = windows(t, t + withinMs).find(([s]) => s > t && s <= t + withinMs);
    return w ? { start: new Date(w[0]), end: new Date(w[1]), retryAfter: retryAfterUntil(w[1], t) } : null;
  } catch {
    return { start: now, end: new Date(t + HOUR_MS), retryAfter: 3600 };
  }
}

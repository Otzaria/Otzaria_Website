/**
 * הגדרות ערוץ משוב החיפוש. הקליטה פעילה כברירת מחדל; רק 0/false מפורש מכבה (503, והלקוח שומר את התור).
 */
export const DEFAULT_LIMITS = Object.freeze({
  registerPerIpPerHour: 10,
  eventsPerIpPerHour: 600,
  eventsPerKeyPerHour: 120,
});

const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export function getSearchFeedbackConfig(env = process.env) {
  return {
    enabled: !FALSE_VALUES.has(String(env.SEARCH_FEEDBACK_ENABLED ?? '').trim().toLowerCase()),
    limits: { ...DEFAULT_LIMITS },
  };
}

/**
 * אזהרת הגדרה: בלי proxy אמין כל הלקוחות שמאחורי ה-proxy חולקים את ה-IP של ה-proxy
 * (או 'unknown'), ומכסות ה-IP הופכות למכסה גלובלית אחת. מחזיר טקסט אזהרה או null.
 */
export function ipBucketWarning(env = process.env) {
  if (!getSearchFeedbackConfig(env).enabled) return null;
  const trusted = Number.parseInt(env.TRUSTED_PROXY_COUNT ?? '0', 10);
  if (Number.isInteger(trusted) && trusted > 0) return null;
  return 'search-feedback: SEARCH_FEEDBACK_ENABLED is on but TRUSTED_PROXY_COUNT is 0 — '
    + 'behind a reverse proxy all clients share one IP rate-limit bucket. Set TRUSTED_PROXY_COUNT.';
}

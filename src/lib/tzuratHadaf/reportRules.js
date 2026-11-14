// צורת הדף — דיווחים ובדיקות "מבט כללי" (טהור): הקטגוריות, הסטטוסים, בדיקת דיווח שנשלח ובדיקת checks.

import { isObj, isFrac, cleanMultiline } from './common.js';

export const REPORT_CATEGORIES = Object.freeze(['missing', 'extra', 'linebreak', 'block', 'size', 'header', 'ein_mishpat', 'gilyon', 'overflow', 'other']);
export const REPORT_STATUSES = Object.freeze(['new', 'in_progress', 'fixed', 'wontfix', 'duplicate']);
export const CHECK_KEYS = Object.freeze(['blocks', 'headers', 'edges', 'size']);
export const MAX_REPORT_TEXT = 2000;
export const MAX_REGIONS = 10;
export const MAX_REPORTS_PER_SUBMISSION = 30;

/** אזורים [{side, x, y, w, h}] ← {regions} או {error} */
export function normalizeRegions(raw) {
  if (raw == null) return { regions: [] };
  if (!Array.isArray(raw)) return { error: 'אזורי הדיווח אינם תקינים' };
  if (raw.length > MAX_REGIONS) return { error: `עד ${MAX_REGIONS} אזורים בדיווח` };
  const regions = [];
  for (const r of raw) {
    if (!isObj(r) || (r.side !== 'scan' && r.side !== 'ours')) return { error: 'אזור בדיווח בלי צד (scan/ours)' };
    const { x, y, w, h } = r;
    if (![x, y, w, h].every(isFrac) || w <= 0 || h <= 0 || x + w > 1.000001 || y + h > 1.000001) {
      return { error: 'אזור בדיווח מחוץ לתמונה' };
    }
    regions.push({ side: r.side, x, y, w, h });
  }
  return { regions };
}

/** דיווח מהמתנדב {category, text, regions} ← {report} או {error} */
export function normalizeReport(raw) {
  if (!isObj(raw)) return { error: 'דיווח לא תקין' };
  const category = REPORT_CATEGORIES.includes(raw.category) ? raw.category : null;
  if (!category) return { error: 'יש לבחור סוג דיווח' };
  const text = cleanMultiline(raw.text, MAX_REPORT_TEXT + 1);
  if (text.length > MAX_REPORT_TEXT) return { error: `תיאור הדיווח ארוך מדי (עד ${MAX_REPORT_TEXT} תווים)` };
  const r = normalizeRegions(raw.regions);
  if (r.error) return { error: r.error };
  if (!text && !r.regions.length) return { error: 'יש לתאר את הבעיה או לסמן אזור' };
  return { report: { category, text, regions: r.regions } };
}

/** checks {blocks, headers, edges, size} ← {checks} (רק המפתחות המוכרים, ok/issue) או {error} */
export function normalizeChecks(raw) {
  if (raw == null) return { checks: {} };
  if (!isObj(raw)) return { error: 'תוצאות המבט הכללי אינן תקינות' };
  const checks = {};
  for (const k of CHECK_KEYS) {
    const v = raw[k];
    if (v == null || v === '') continue;
    if (v !== 'ok' && v !== 'issue') return { error: `ערך לא תקין בבדיקה ${k}` };
    checks[k] = v;
  }
  return { checks };
}

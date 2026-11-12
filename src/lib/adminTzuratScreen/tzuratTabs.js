// "צורת הדף" (/library/admin/tzurat-hadaf) — שמונה הלשוניות בשמות לפי המילון, המונים מתשובת GET stats, וקריאת
// הלשונית מהכתובת. לוגיקה טהורה (נבדק ב-tzuratTabs.test.mjs).
//
// מזהי הלשוניות נשארו כמו קודם (#disputes וכו'), כדי שהקישורים מלוח הניהול (lib/adminDashboard.js) וקישורים שמורים
// ימשיכו לעבוד. hideOnPhone — בטלפון הלשונית לא בשורה (כדי שהשאר ייכנסו), אלא בתפריט ⋮ של הכותרת.

import { formatNumber } from '../adminTerms.js'

/** "סקירה" → "מצב", "העלאת חבילות" → "חבילות", "הגשות עמוד" → "הגשות", "ייצוא" → "הורדות", "מפתחות API" → "מפתחות גישה" */
export const TZURAT_TABS = [
  { id: 'overview', icon: 'bar_chart', label: 'מצב' },
  { id: 'uploads', icon: 'cloud_upload', label: 'חבילות', hideOnPhone: true },
  { id: 'disputes', icon: 'forum', label: 'מחלוקות' },
  { id: 'submissions', icon: 'fact_check', label: 'הגשות' },
  { id: 'reports', icon: 'flag', label: 'דיווחים' },
  { id: 'export', icon: 'download', label: 'הורדות', hideOnPhone: true },
  { id: 'guide', icon: 'menu_book', label: 'הנחיות', hideOnPhone: true },
  { id: 'tokens', icon: 'key', label: 'מפתחות גישה', hideOnPhone: true },
]
export const TZURAT_TAB_IDS = TZURAT_TABS.map((t) => t.id)
export const DEFAULT_TAB = 'overview'

/**
 * הלשונית מהכתובת: ?tab=… (כמו בשאר המסכים), ואם אין — #… (הקישורים הקיימים). לא מוכרת — null.
 * @param {{ search?: string, hash?: string }} location
 */
export function tabFromLocation({ search = '', hash = '' } = {}) {
  const fromQuery = new URLSearchParams(search).get('tab')
  if (fromQuery && TZURAT_TAB_IDS.includes(fromQuery)) return fromQuery
  const fromHash = String(hash).replace(/^#/, '')
  return TZURAT_TAB_IDS.includes(fromHash) ? fromHash : null
}

const n = (v) => Math.max(0, Number(v) || 0)

/** המונים של הלשוניות מתשובת stats: מחלוקות (במחלוקת), הגשות (ממתינות לאישור), דיווחים (חדשים). בלי stats — null */
export function tabCounts(stats) {
  if (!stats) return null
  return {
    disputes: n(stats.items?.byStatus?.disputed),
    submissions: n(stats.submissions?.byStatus?.submitted),
    reports: n(stats.reports?.byStatus?.new),
  }
}

/** איזה חלק בתשובת stats מונה כל סוג פריט */
const STATS_GROUP = { item: 'items', submission: 'submissions', report: 'reports' }

/**
 * stats אחרי שפריט אחד שינה מצב מקומית (הכרעה, אישור הגשה, מצב דיווח) — בלי לפנות לשרת: המונה של המצב הקודם
 * יורד ב-1 (לא מתחת ל-0), ושל המצב החדש עולה. כך המונים בלשוניות ובלשונית "מצב" מתעדכנים יחד.
 * @param {any} stats @param {'item'|'submission'|'report'} kind @param {string} from @param {string} to
 */
export function statsAfterChange(stats, kind, from, to) {
  const group = STATS_GROUP[kind]
  if (!stats || !group || !stats[group] || from === to) return stats
  const by = { ...(stats[group].byStatus || {}) }
  if (from) by[from] = n(by[from]) - (n(by[from]) > 0 ? 1 : 0)
  if (to) by[to] = n(by[to]) + 1
  return { ...stats, [group]: { ...stats[group], byStatus: by } }
}

const COUNT_TEXT = {
  disputes: (c) => (c === 1 ? 'מחלוקת אחת' : `${formatNumber(c)} מחלוקות`),
  submissions: (c) => (c === 1 ? 'הגשה אחת ממתינה לאישור' : `${formatNumber(c)} הגשות ממתינות לאישור`),
  reports: (c) => (c === 1 ? 'דיווח חדש אחד' : `${formatNumber(c)} דיווחים חדשים`),
}

/**
 * הלשוניות עם המונים (מונה 0 לא מוצג). countLabel — הנוסח לקורא המסך. pending (stats עוד נטען) — count: null בלשוניות
 * שיש להן מונה: ui/Tabs שומר להן מקום, כדי שהלשוניות לא יזוזו כשהמספרים מגיעים.
 * @returns {{ id: string, icon: string, label: string, hideOnPhone?: boolean, count?: number, countLabel?: string }[]}
 */
export function tzuratTabItems(stats, { pending = false } = {}) {
  const counts = tabCounts(stats)
  return TZURAT_TABS.map((t) => {
    if (!counts) return pending && t.id in COUNT_TEXT ? { ...t, count: null } : t
    const c = counts?.[t.id]
    return c > 0 ? { ...t, count: c, countLabel: COUNT_TEXT[t.id](c) } : t
  })
}

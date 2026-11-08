// "משוב חיפוש" (/library/admin/search-feedback) — הלשוניות, שורת הסיכום שמתחת לכותרת, טבלאות הספירה ומצב ההתקנה.
// לוגיקה טהורה (נבדק ב-searchFeedbackScreen.test.mjs). הנתונים — מתשובת GET /api/search-feedback/admin/stats, כמו קודם.

import { formatNumber } from '../adminTerms.js'

/** סיכום (טבלאות הספירה) · התקנות (ההתקנות הפעילות ביותר, עם חסימה) */
export const SEARCH_FEEDBACK_TABS = [
  { id: 'summary', icon: 'bar_chart', label: 'סיכום' },
  { id: 'keys', icon: 'devices', label: 'התקנות' },
]
export const DEFAULT_TAB = 'summary'

export const EVENT_TYPE_LABELS = {
  search: 'חיפוש',
  results_shown: 'הצגת תוצאות',
  open: 'פתיחת תוצאה',
  dwell: 'זמן קריאה',
  vote: 'הצבעה',
}

/** הלשונית מ-?tab= — לא מוכרת: null */
export function tabFromSearch(search = '') {
  const tab = new URLSearchParams(search).get('tab')
  return SEARCH_FEEDBACK_TABS.some((t) => t.id === tab) ? tab : null
}

/** מונה ללשונית "התקנות" — כמה חסומות (רק כשיש) */
export function searchFeedbackTabItems(data) {
  const blocked = Number(data?.keys?.blocked) || 0
  return SEARCH_FEEDBACK_TABS.map((t) => (t.id === 'keys' && blocked > 0
    ? { ...t, count: blocked, countLabel: blocked === 1 ? 'התקנה חסומה אחת' : `${formatNumber(blocked)} התקנות חסומות` }
    : t))
}

const plural = (n, one, many) => (n === 1 ? one : `${formatNumber(n)} ${many}`)

/** "12,400 אירועים · 85 התקנות, מהן 3 חסומות" — בלי נתונים: '' */
export function summaryText(data) {
  if (!data) return ''
  const events = Number(data.totalEvents) || 0
  const keys = Number(data.keys?.total) || 0
  const blocked = Number(data.keys?.blocked) || 0
  const parts = [plural(events, 'אירוע אחד', 'אירועים'), plural(keys, 'התקנה אחת', 'התקנות')]
  const tail = blocked > 0 ? `, ${blocked === 1 ? 'אחת מהן חסומה' : `מהן ${formatNumber(blocked)} חסומות`}` : ''
  return `${parts.join(' · ')}${tail}`
}

/** תווית למודל: המשפחה, ובסוגריים הגרסה המוקטנת (קוונטיזציה) — או "מלא" כשאין */
export function modelLabel({ modelFamilyId, modelQuantization }) {
  if (!modelFamilyId) return 'לא ידוע'
  return modelQuantization ? `${modelFamilyId} (${modelQuantization})` : `${modelFamilyId} (מלא)`
}

/** ארבע טבלאות הספירה של לשונית "סיכום": [{ id, title, rows: [{ key, label, ltr, count }] }] */
/** יום מהשרת (YYYY-MM-DD) בפורמט של שאר האתר: "10.10.2026". ערך אחר — כמו שהוא */
export function dayText(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''))
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : String(day || '')
}

export function countTables(data) {
  if (!data) return []
  return [
    {
      id: 'type',
      title: 'לפי סוג אירוע',
      rows: (data.byType || []).map((r) => ({ key: r.type, label: EVENT_TYPE_LABELS[r.type] || r.type, ltr: !EVENT_TYPE_LABELS[r.type], count: r.count })),
    },
    { id: 'day', title: 'לפי יום (30 הימים האחרונים)', rows: (data.byDay || []).map((r) => ({ key: r.day, label: dayText(r.day), count: r.count })) },
    {
      id: 'model',
      title: 'לפי מודל',
      rows: (data.byModel || []).map((r) => ({ key: `${r.modelFamilyId}|${r.modelQuantization}`, label: modelLabel(r), ltr: Boolean(r.modelFamilyId), count: r.count })),
    },
    {
      id: 'version',
      title: 'לפי גרסת התוכנה',
      rows: (data.byAppVersion || []).map((r) => ({ key: String(r.appVersion), label: r.appVersion || 'לא ידוע', ltr: Boolean(r.appVersion), count: r.count })),
    },
  ]
}

/** מצב ההתקנה: חסומה / פעילה */
export const isBlocked = (key) => key?.status === 'blocked'
export const keyStatusLabel = (key) => (isBlocked(key) ? 'חסומה' : 'פעילה')

/** מזהה התקנה מקוצר לתצוגה (המלא — בריחוף) */
export const shortKeyId = (keyId) => (String(keyId || '').length > 12 ? `${String(keyId).slice(0, 12)}…` : String(keyId || ''))

/** כתובת החסימה / ביטול החסימה — POST, בלי גוף (כמו קודם) */
export function keyActionUrl(keyId, action) {
  return `/api/search-feedback/admin/keys/${encodeURIComponent(keyId)}/${action}`
}

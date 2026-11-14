// "מקורות פרטיים" (/library/admin/private-sources) — הלשוניות והמונים, ורשימות לשונית "הגדרות" (סטים, מצבי מקור,
// אופני אישור, פלטפורמות, מצבי פניות): השם, מפתח ההגדרה בשרת, הניסוחים לחלון העריכה, והספירה כמה פריטים משתמשים
// בכל ערך. לוגיקה טהורה (נבדק ב-privateSourcesScreen.test.mjs). מפתחות ההגדרות — כמו קודם.

import { formatNumber } from '../adminTerms.js'
import { OUTREACH_STATUSES_CONFIG_KEY } from '../institute-outreach.js'
import { MANUAL_SETS_CONFIG_KEY } from '../private-sources-sets.js'

export const PRIVATE_SOURCES_TABS = [
  { id: 'sources', icon: 'copyright', label: 'מקורות' },
  { id: 'outreach', icon: 'contact_phone', label: 'פניות למכונים', shortLabel: 'פניות' },
  { id: 'settings', icon: 'settings', label: 'הגדרות' },
]
export const DEFAULT_TAB = 'sources'

/** הלשונית מ-?tab= — לא מוכרת: null */
export function tabFromSearch(search = '') {
  const tab = new URLSearchParams(search).get('tab')
  return PRIVATE_SOURCES_TABS.some((t) => t.id === tab) ? tab : null
}

/**
 * מונים ללשוניות: מקורות — כמה פריטים בלי רשומה; פניות — כמה בחשד לכפילות. אפס / עוד לא נטען — בלי מונה.
 * @param {{ missing?: number } | null} sourceStats @param {{ duplicates?: number } | null} outreachStats
 */
export function privateSourcesTabItems(sourceStats, outreachStats) {
  const missing = Number(sourceStats?.missing) || 0
  const duplicates = Number(outreachStats?.duplicates) || 0
  return PRIVATE_SOURCES_TABS.map((t) => {
    if (t.id === 'sources' && missing > 0) return { ...t, count: missing, countLabel: missing === 1 ? 'ספר אחד שלא תועד' : `${formatNumber(missing)} ספרים שלא תועדו` }
    if (t.id === 'outreach' && duplicates > 0) return { ...t, count: duplicates, countLabel: duplicates === 1 ? 'פנייה אחת שאולי כפולה' : `${formatNumber(duplicates)} פניות שאולי כפולות` }
    return t
  })
}

const DELETE_BODY = (what, they) => `אם תמחק את ה${what}, ${they} יישארו עם ערך לא תקין.\n\nמומלץ לעדכן אותם לפני המחיקה.`

/**
 * הרשימות שבלשונית "הגדרות", בסדר התצוגה. kind: 'sets' (חלון הסטים) או 'statuses' (חלון הרשימה עם צבעים).
 * configKey — מפתח ההגדרה בשרת (POST /api/admin/private-sources/config { key, value }), כמו קודם.
 * source — מאיזו רשימה הנתונים: 'sources' (המקורות) או 'outreach' (הפניות).
 */
export const SETTINGS_LISTS = [
  {
    id: 'sets', kind: 'sets', source: 'sources', title: 'סטים', configKey: MANUAL_SETS_CONFIG_KEY,
    description: 'ספרים שהם חלקים של אותו חיבור וחולקים פרטי מקור אחד. סטים בתבנית "X על Y" נוצרים לבד; כאן מגדירים סטים ידניים.',
  },
  {
    id: 'statuses', kind: 'statuses', source: 'sources', title: 'מצבי מקור', configKey: 'private_source_statuses',
    description: 'איפה עומד האישור לכל ספר.',
    modal: { title: 'מצבי מקור', itemNoun: 'מצב', itemNounPlural: 'מצבים', usageNoun: 'ספרים', deleteConfirmBody: DELETE_BODY('מצב', 'הספרים האלה'), deleteConfirmQuestion: 'למחוק את המצב?' },
  },
  {
    id: 'methods', kind: 'statuses', source: 'sources', title: 'אופני אישור', configKey: 'private_source_permission_methods',
    description: 'איך התקבל האישור (בכתב, בטלפון וכדומה).',
    modal: { title: 'אופני אישור', itemNoun: 'אופן', itemNounPlural: 'אופנים', usageNoun: 'ספרים', deleteConfirmBody: DELETE_BODY('אופן', 'הספרים האלה'), deleteConfirmQuestion: 'למחוק את האופן?' },
  },
  {
    id: 'platforms', kind: 'statuses', source: 'sources', title: 'פלטפורמות', configKey: 'private_source_platforms',
    description: 'איפה מותר לפרסם את הספר.',
    modal: {
      title: 'פלטפורמות', itemNoun: 'פלטפורמה', itemNounPlural: 'פלטפורמות', usageNoun: 'ספרים',
      existingTitle: 'פלטפורמות קיימות', addTitle: 'הוספת פלטפורמה חדשה', assignedText: 'משויכת',
      deleteConfirmBody: 'אם תמחק את הפלטפורמה, הספרים האלה יישארו עם ערך לא תקין.\n\nמומלץ לעדכן אותם לפני המחיקה.',
      deleteConfirmQuestion: 'למחוק את הפלטפורמה?',
    },
  },
  {
    id: 'outreachStatuses', kind: 'statuses', source: 'outreach', title: 'מצבי פניות', configKey: OUTREACH_STATUSES_CONFIG_KEY,
    description: 'איפה עומדת כל פנייה למכון.',
    modal: {
      title: 'מצבי פניות', itemNoun: 'מצב', itemNounPlural: 'מצבים', usageNoun: 'פניות',
      deleteConfirmBody: 'אם תמחק את המצב, הפניות האלה יישארו עם מצב לא תקין.\n\nמומלץ לעדכן אותן לפני המחיקה.', deleteConfirmQuestion: 'למחוק את המצב?',
    },
  },
]

export const settingsList = (id) => SETTINGS_LISTS.find((l) => l.id === id) || null

/**
 * מה החלון של הרשימה צריך לדעת על השימוש (הפרמטר uploads של StatusConfigModal — [{ bookStatus }]), כמו קודם:
 * מצבי מקור — record.status; אופני אישור — record.permissionMethod; פלטפורמות — כל ערך ב-allowedPlatforms;
 * מצבי פניות — status של כל פנייה.
 */
export function usageRows(listId, { sourceItems = [], outreachItems = [] } = {}) {
  switch (listId) {
    case 'statuses': return sourceItems.filter((i) => i.record).map((i) => ({ bookStatus: i.record.status }))
    case 'methods': return sourceItems.filter((i) => i.record?.permissionMethod).map((i) => ({ bookStatus: i.record.permissionMethod }))
    case 'platforms': return sourceItems.flatMap((i) => (i.record?.allowedPlatforms || []).map((p) => ({ bookStatus: p })))
    case 'outreachStatuses': return outreachItems.map((item) => ({ bookStatus: item.status }))
    default: return []
  }
}

/** כמה פעמים כל ערך בשימוש: { key: count } */
export function usageCounts(listId, data) {
  const counts = {}
  for (const { bookStatus } of usageRows(listId, data)) if (bookStatus) counts[bookStatus] = (counts[bookStatus] || 0) + 1
  return counts
}

/** ערכי רשימה לתצוגה בלשונית ההגדרות: [{ key, label, color, count }] בסדר השמור */
export function settingsValues(listId, options, data) {
  const counts = usageCounts(listId, data)
  return Object.entries(options || {}).map(([key, config]) => ({ key, label: config?.label || key, color: config?.color || '', count: counts[key] || 0 }))
}

/** הסטים הידניים לתצוגה: [{ key, label, count }] — count = כמה ספרים */
export function manualSetsSummary(manualSets) {
  return Object.entries(manualSets || {}).map(([key, set]) => ({ key, label: set?.label || key, count: (set?.bookPaths || []).length }))
}

export const booksCount = (n) => (n === 1 ? 'ספר אחד' : `${formatNumber(n)} ספרים`)
export const usageText = (n, noun) => (n === 0 ? 'לא בשימוש' : `${formatNumber(n)} ${noun}`)

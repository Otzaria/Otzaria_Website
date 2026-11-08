/**
 * לוגיקה טהורה (ללא state/DOM) לסינון וסטטיסטיקה של רשימת הפניות למכונים —
 * חולצה מ-OutreachTab.jsx כדי לאפשר בדיקות ישירות בלי רינדור.
 */

import { OPEN_OUTREACH_STATUSES } from '@/lib/institute-outreach'
import { formatDateShort } from '@/lib/formatDate'

/** תאריך קצר לתצוגה, עם הגנה מפני ערך חסר/לא תקין */
export function formatOutreachDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatDateShort(date)
}

/**
 * סינון רשימת הפניות לפי סטטוס, "כפילויות בלבד", וחיפוש טקסט חופשי על פני
 * שם המכון, איש הקשר, טלפון, מייל, מי פנה והנושא.
 *
 * @param {Array} items
 * @param {{search?:string, statusFilter?:string, onlyDuplicates?:boolean, duplicatesById:Map}} opts
 */
export function filterOutreachItems(
  items,
  { search = '', statusFilter = '', onlyDuplicates = false, duplicatesById }
) {
  const term = search.trim().toLowerCase()
  return items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false
    if (onlyDuplicates && !duplicatesById.has(item._id)) return false
    if (!term) return true
    return [
      item.instituteName,
      item.contactName,
      item.contactPhone,
      item.contactEmail,
      item.outreachBy,
      item.subject,
    ].some((field) => (field || '').toLowerCase().includes(term))
  })
}

/** סטטיסטיקה כללית: סה"כ, פתוחות (לפי סטטוסים "פתוחים"), חשד לכפילות, ולפי סטטוס */
export function computeOutreachStats(items, duplicatesById) {
  const byStatus = {}
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1
  }
  return {
    total: items.length,
    open: items.filter((item) => OPEN_OUTREACH_STATUSES.includes(item.status)).length,
    duplicates: duplicatesById.size,
    byStatus,
  }
}

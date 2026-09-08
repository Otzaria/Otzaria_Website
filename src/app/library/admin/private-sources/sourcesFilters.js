/**
 * לוגיקה טהורה (ללא state/DOM) לסינון, קיבוץ וסטטיסטיקה של רשימת המקורות
 * הפרטיים — חולצה מ-SourcesTab.jsx כדי לאפשר בדיקות ישירות בלי רינדור.
 */

/** ערך מיוחד לסינון "ללא רשומה" בבורר הסטטוס */
export const NO_RECORD = '__none__'

/** קטגוריה שמוצגת תמיד בתחתית העמוד */
export const NOT_ADAPTED_CATEGORY = 'לא מותאם עדיין לאוצריא'

/**
 * האם פריט (ספר או סט) תואם לסינון הנוכחי: חיפוש טקסט חופשי, סטטוס, ו"ללא
 * רשומה בלבד". חיפוש הטקסט תואם גם כשאחד מחברי הסט (ולא הסט עצמו) תואם.
 */
export function matchesSourceItem(item, { search = '', statusFilter = '', onlyMissing = false } = {}) {
  if (onlyMissing && item.record) return false

  if (statusFilter) {
    if (statusFilter === NO_RECORD) {
      if (item.record) return false
    } else if ((item.record?.status || '') !== statusFilter) {
      return false
    }
  }

  const term = search.trim().toLowerCase()
  if (!term) return true
  if (
    item.bookTitle.toLowerCase().includes(term) ||
    item.bookPath.toLowerCase().includes(term) ||
    (item.record?.ownerName || '').toLowerCase().includes(term) ||
    (item.record?.obtainedBy || '').toLowerCase().includes(term)
  ) {
    return true
  }
  // סט מתאים גם כשאחד מחבריו מתאים
  return (item.books || []).some(
    (member) =>
      member.bookTitle.toLowerCase().includes(term) || member.bookPath.toLowerCase().includes(term)
  )
}

/**
 * קיבוץ פריטים לפי קטגוריה עליונה, ממוין לפי שם קטגוריה (עברית) — עם
 * "לא מותאם עדיין לאוצריא" תמיד בתחתית.
 */
export function groupSourceItemsByCategory(items) {
  const byCategory = new Map()
  for (const item of items) {
    const list = byCategory.get(item.category) || []
    list.push(item)
    byCategory.set(item.category, list)
  }

  return Array.from(byCategory.entries())
    .map(([category, rows]) => ({ category, rows, count: rows.length }))
    .sort((a, b) => {
      const aLast = a.category === NOT_ADAPTED_CATEGORY
      const bLast = b.category === NOT_ADAPTED_CATEGORY
      if (aLast !== bLast) return aLast ? 1 : -1
      return a.category.localeCompare(b.category, 'he')
    })
}

/**
 * סטטיסטיקה כללית על הרשימה. הספירה היא ב"פריטים": סט נחשב פריט אחד
 * (רשומה אחת משותפת), לא לפי מספר הספרים שבתוכו.
 */
export function computeSourceStats(items) {
  const withRecord = items.filter((i) => i.record).length
  const sets = items.filter((i) => i.kind === 'set').length
  const byStatus = {}
  for (const item of items) {
    if (!item.record) continue
    const key = item.record.status || ''
    byStatus[key] = (byStatus[key] || 0) + 1
  }
  return {
    total: items.length,
    sets,
    withRecord,
    missing: items.length - withRecord,
    byStatus,
  }
}

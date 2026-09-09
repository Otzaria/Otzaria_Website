/**
 * לוגיקה טהורה (ללא state/DOM) לסינון, מיון וסטטיסטיקה של רשימת ספרי
 * הדיקטה — חולצה מ-AdminDictaBooksClient.jsx כדי לאפשר בדיקות ישירות
 * בלי רינדור.
 */

/** ממיר ערך תאריך לחותמת זמן מספרית, או null אם הערך חסר/לא תקין */
export function getDateTimestamp(value) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

/** חישוב כמויות ספרים לפי סטטוס במעבר אחד על המערך */
export function computeStatusCounts(books) {
  return books.reduce(
    (acc, book) => {
      acc.total++
      if (book.status === 'available') acc.available++
      else if (book.status === 'in-progress') acc.inProgress++
      else if (book.status === 'completed') acc.completed++
      return acc
    },
    { total: 0, available: 0, inProgress: 0, completed: 0 }
  )
}

/** סינון רשימת הספרים לפי סטטוס נבחר ('all' מחזיר את כל הרשימה) */
export function filterBooksByStatus(books, statusFilter) {
  return books.filter((book) => {
    if (statusFilter === 'all') return true
    return book.status === statusFilter
  })
}

/**
 * מיון רשימת ספרים לפי sortConfig ({key, direction}). ללא מפתח - הסדר
 * המקורי נשמר. תומך בטיפול מיוחד בשדה claimedBy (שם המשתמש) ובתאריך
 * updatedAt (השוואה מספרית ולא לקסיקוגרפית).
 */
export function sortBooks(books, sortConfig) {
  return [...books].sort((a, b) => {
    if (!sortConfig.key) return 0

    let aValue = a[sortConfig.key] || ''
    let bValue = b[sortConfig.key] || ''

    if (sortConfig.key === 'claimedBy') {
      aValue = a.claimedBy?.name || ''
      bValue = b.claimedBy?.name || ''
    }

    if (sortConfig.key === 'updatedAt') {
      aValue = getDateTimestamp(a.updatedAt)
      bValue = getDateTimestamp(b.updatedAt)
    }

    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1
    }
    return 0
  })
}

/** סמל המיון להצגה בכותרת עמודה */
export function getSortIcon(sortConfig, columnName) {
  if (sortConfig.key !== columnName) return '↕'
  return sortConfig.direction === 'asc' ? '↑' : '↓'
}

// מיון רשימות הבחירה של מסנני דף ניהול העמודים — לוגיקה טהורה עם טסט
// (adminPagesFilterOptions.test.mjs). משמשת את /api/admin/pages/filter-options.

/** שמות ספרים ייחודיים, באותו מיון שהדף עשה קודם בעצמו: [...new Set(names)].sort() */
export function sortBookNames(names) {
  return [...new Set(names)].sort()
}

/** משתמשים ייחודיים לפי id, ממוינים לפי שם בסדר האלפבית העברי */
export function sortFilterUsers(users) {
  const byId = new Map()
  for (const u of users) {
    if (u && u.id && !byId.has(u.id)) byId.set(u.id, u)
  }
  return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'))
}

// פעולות סידור מחדש של רשימה — משמשות את לשונית "סידור החנות" הן עבור חיצי הסדר
// (moveItem: החלפת מקומות עם שכן) והן עבור גרירה-ושחרור (reorderList: העברה למיקום יעד).

// החלפת מקומות בין פריט לשכנו — לשינוי סדר באמצעות חיצים
export function moveItem(list, index, direction) {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

// העברת פריט מאינדקס לאינדקס — לגרירה-ושחרור
export function reorderList(list, from, to) {
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

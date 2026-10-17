/**
 * הלוגיקה הטהורה של scroll-spy בתוכן העניינים (useScrollSpy): איזה סעיף "נוכחי" — הכותרת
 * האחרונה שעברה את קו ה-40% העליונים של המסך — וגלילת הסרגל אל הפריט המודגש.
 */

/** האינדקס של הכותרת האחרונה שהחלק העליון שלה מעל limit (בפיקסלים מראש המסך); -1 אם אין. */
export function lastHeadingAbove(tops: readonly number[], limit: number): number {
  let last = -1
  tops.forEach((top, index) => {
    if (top < limit) last = index
  })
  return last
}

/**
 * כמה לגלול מכל עם גלילה פנימית כדי שפריט יהיה גלוי בו (בשוליים margin), או null אם הוא כבר גלוי.
 * הכל במונחי getBoundingClientRect — כך לא גוללים את החלון עצמו (כמו scrollIntoView).
 */
export function scrollDeltaToReveal(
  item: { top: number; bottom: number },
  container: { top: number; bottom: number },
  margin = 24
): number | null {
  if (item.top < container.top + margin) return item.top - container.top - margin
  if (item.bottom > container.bottom - margin) return item.bottom - container.bottom + margin
  return null
}

/** מזהה העוגן מתוך href של פריט תוכן עניינים ("#intro" → "intro") */
export function anchorId(href: string): string {
  const hash = href.indexOf('#')
  if (hash < 0) return ''
  const raw = href.slice(hash + 1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

// עימוד בצד הלקוח — משותף לכל רשימות הניהול. כל מסך עוטף עם גודל העמוד שלו (ברירת המחדל שלו),
// כדי שהמסכים לא יהיו תלויים זה בזה (בעבר כולם ייבאו מ-adminUploads/uploadsQuery.js).

/**
 * עמוד מתוך רשימה. העמוד מוגבל לטווח: עמוד שכבר לא קיים — האחרון; לא מספר / שבור / קטן מ-1 — הראשון.
 * @template T
 * @param {T[] | null | undefined} items
 * @param {number} page
 * @param {number} size גודל עמוד (חיובי)
 * @returns {{ items: T[], page: number, pageCount: number, total: number, from: number, to: number }}
 */
export function paginate(items, page, size) {
  const total = items?.length || 0
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount)
  const start = (current - 1) * size
  const slice = (items || []).slice(start, start + size)
  return { items: slice, page: current, pageCount, total, from: total === 0 ? 0 : start + 1, to: start + slice.length }
}

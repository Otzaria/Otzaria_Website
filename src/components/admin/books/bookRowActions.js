// אילו פעולות יש בכל שורה (ובמגירה) — לוגיקה טהורה, כדי שאפשר לבדוק אותה בנפרד.
//
// היררכיה (דפוסי ה-UX של הניהול): פעולה ראשית אחת גלויה בשורה — "פתח" (המגירה של הספר) — וכל
// השאר ב-⋮ בסדר קבוע: פתיחה · עריכה (שם, קטגוריה, הנחיות, הסתר / הצג, זיהוי, מזג) · הורדה · ואחרי
// מפריד — ההרסנית (באדום). אותו סדר במגירה (bookDrawerActions), כדי שלא יהיו שני מקורות אמת. כל הפעולות כאן מותרות לכל שלושת התפקידים שרואים את המסך (admin, admin_books,
// admin_books_only — כל נקודות הקצה בודקות hasBookLibraryAccess). פעולה שאי אפשר לעשות בגלל
// הנתון עצמו (הצגת ספר אישי) — מושבתת, והשם שלה אומר למה.
import { isPersonal } from '@/lib/adminBooks/bookTerms'

/** הכתובת של הספר בספרייה (דף הספר, עם כל העמודים) */
export function libraryHref(book) {
  return `/library/books/${encodeURIComponent(book.path)}`
}

/**
 * הסתר / הצג — לפי המצב הנוכחי. ספר אישי מוסתר: אי אפשר להציג אותו (השרת חוסם), והשם אומר למה.
 * @returns {{ id: string, icon: string, label: string, disabled?: boolean }}
 */
export function visibilityAction(book) {
  if (!book.isHidden) return { id: 'hide', icon: 'visibility_off', label: 'הסתר' }
  if (isPersonal(book)) return { id: 'show', icon: 'visibility', label: 'הצג — לא אפשרי בספר אישי', disabled: true }
  return { id: 'show', icon: 'visibility', label: 'הצג' }
}

/**
 * פריטי ⋮ של שורת ספר.
 * @param {{ book: any, actions: Record<string, (...args: any[]) => void>, busy?: boolean }} options
 * @returns {import('@/components/ui/MenuButton').MenuItem[]}
 */
export function bookMenuItems({ book, actions, busy = false }) {
  const visibility = visibilityAction(book)
  const items = [
    { id: 'library', icon: 'open_in_new', label: 'פתח בספרייה', onSelect: () => actions.openLibrary(book) },
    { separator: true, id: 'sep-edit' },
    { id: 'rename', icon: 'edit', label: 'שנה שם', onSelect: () => actions.rename(book) },
    // לספר אישי אין קטגוריה לשנות — הפריט לא מוצג
    ...(isPersonal(book) ? [] : [{ id: 'category', icon: 'category', label: 'שנה קטגוריה', onSelect: () => actions.changeCategory(book) }]),
    { id: 'instructions', icon: 'edit_note', label: 'הנחיות עריכה', onSelect: () => actions.openDrawer(book, 'instructions') },
    { ...visibility, onSelect: () => (visibility.id === 'hide' ? actions.hide(book) : actions.show(book)) },
    { id: 'ocr', icon: 'document_scanner', label: 'זיהוי טקסט אוטומטי', onSelect: () => actions.openDrawer(book, 'ocr') },
    { id: 'merge', icon: 'call_merge', label: 'מזג עם ספרים אחרים', onSelect: () => actions.merge([book]) },
    { separator: true, id: 'sep-download' },
    { id: 'download-text', icon: 'download', label: 'הורד טקסט', onSelect: () => actions.downloadText(book) },
    { id: 'download-pdf', icon: 'picture_as_pdf', label: 'הורד PDF', onSelect: () => actions.downloadPdf(book) },
    { separator: true, id: 'sep-danger' },
    { id: 'delete', icon: 'delete_forever', label: 'מחק לצמיתות', danger: true, onSelect: () => actions.remove(book) },
  ]
  // בזמן בקשה על הספר — הכול מושבת (בלי בקשה כפולה), חוץ מפתיחה בספרייה
  return busy ? items.map((i) => (i.separator || i.id === 'library' ? i : { ...i, disabled: true })) : items
}

/**
 * הפעולות בלשונית "פרטים" של המגירה — אותם פריטים כמו ב-⋮ (מקור אמת אחד), בלי מה שכבר לשונית במגירה
 * (הנחיות, זיהוי) ובלי "פתח בספרייה", שהיא הפעולה הראשית ומוצגת לבד.
 */
export function bookDrawerActions({ book, actions, busy = false }) {
  const items = bookMenuItems({ book, actions, busy }).filter((i) => !['library', 'instructions', 'ocr'].includes(i.id))
  // בלי מפריד בהתחלה או שני מפרידים רצופים
  return items.filter((item, index) => !item.separator || (index > 0 && !items[index - 1].separator))
}

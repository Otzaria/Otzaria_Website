// מי רשאי להפעיל OCR על ספר, ועל איזה ספר. לוגיקת ההפעלה/המצב/העצירה עצמה אחת לשני המסלולים
// (bookOcrStart.js / bookOcrStatus.js / bookOcrCancel.js); כאן רק שער הכניסה ובדיקת הספר:
//
// - מסלול הניהול (/api/admin/books/ocr/*): מנהלי ספרייה, כל ספר — בדיוק כמו קודם (canUseBook: null
//   = בלי בדיקה ובלי שאילתה נוספת).
// - מסלול הבעלים (/api/user/books/ocr/*): בעלי התפקיד private_ocr, ורק על ספר אישי שלהם (ownerId
//   שלהם — ספר שהעלו ב"הספרים שלי"). ספר של אחר, או ספר ציבורי — כאילו אינו קיים (404).
import { hasBookLibraryAccess, hasPrivateOcrAccess } from '../roles.js'

/** אותה הגדרת ספר מוגבל כמו בנתיבי העורך. */
export function isRestrictedBook(book) {
  return book?.isPrivate === true || book?.isHidden === true
}

/** ספר אישי צריך להיות שייך למשתמש ולהישאר מוסתר או פרטי, גם ברשומות עם דגל יחיד. */
export function ownsPersonalBook(book, user) {
  const userId = user?._id || user?.id
  if (!book?.ownerId || !userId || !isRestrictedBook(book)) return false
  return String(book.ownerId?._id || book.ownerId) === String(userId)
}

export const ADMIN_BOOK_OCR = Object.freeze({ hasAccess: hasBookLibraryAccess, canUseBook: null })

export const OWNER_BOOK_OCR = Object.freeze({ hasAccess: hasPrivateOcrAccess, canUseBook: ownsPersonalBook })

/** האם הספר (שכבר נטען) זמין לפעולה במסלול הנתון */
export function bookAllowed(access, book, user) {
  return Boolean(book) && (!access.canUseBook || access.canUseBook(book, user))
}

import { hasBookLibraryAccess, hasPrivateOcrAccess, isAdmin } from './roles.js'

// גם מסמכים ישנים ללא שדות הפרטיות נשארים ציבוריים.
export const PUBLIC_BOOK_FILTER = { isPrivate: { $ne: true }, ownerId: null }

export function ownsBook(book, user) {
  const id = user?._id || user?.id
  return Boolean(id && book?.ownerId && String(book.ownerId?._id || book.ownerId) === String(id))
}

export function canRunPrivateOcr(book, user) {
  return Boolean(book?.privateOcr && book?.isPrivate && hasPrivateOcrAccess(user) && (isAdmin(user) || ownsBook(book, user)))
}

export function canReadBook(book, user) {
  if (!book) return false
  if (hasBookLibraryAccess(user)) return true
  if (book.privateOcr) return canRunPrivateOcr(book, user)
  return (!book.isHidden && !book.isPrivate) || ownsBook(book, user)
}

// ספר פרטי אינו עובר דרך תור העריכה או מתפרסם בסיום.
export function canUseBookEditor(book, user) {
  return canReadBook(book, user) && (!book.privateOcr || hasBookLibraryAccess(user))
}

// סינון עמודים לפני קיבוץ, ספירה או הגבלה: בלי טקסטים/שמות/ספירות של ספר פרטי.
export function publicPagesStages() {
  return [
    { $lookup: { from: 'books', localField: 'book', foreignField: '_id',
      pipeline: [{ $match: PUBLIC_BOOK_FILTER }, { $project: { _id: 1 } }], as: 'publicBook' } },
    { $match: { 'publicBook.0': { $exists: true } } },
    { $unset: 'publicBook' },
  ]
}

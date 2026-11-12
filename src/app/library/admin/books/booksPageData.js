// הנתונים של מסך הספרים (/library/admin/books ולשוניותיו) — נשלפים בשרת, בזמן הרינדור, ולא ב-fetch
// מהדפדפן אחרי הטעינה (בלי שלד בכניסה). הלוגיקה של רשימת הספרים — בדיוק כמו /api/library/list בענף
// isAdmin (src/app/api/library/list/route.js): עמודי הניהול נגישים רק לתפקידים עם hasBookLibraryAccess
// (proxy.js), והנתון זהה לכל מי שמגיע לכאן.
//
// בלי editingInfo בכוונה: הרשימה לא מציגה הנחיות עריכה, והמגירה טוענת אותן לספר אחד (/api/book/[id]).
// הן היו רוב משקל הנתון — במטמון ובכל טעינה של הלשוניות "ספרים" ו"קטגוריות".
//
// מטמון (Data Cache של Next, לא HTTP): הרשימה נשמרת בזיכרון השרת עם תגית BOOKS_ADMIN_LIST וחלון גיבוי
// קצר. כל route שמשנה ספר (הוספה / מחיקה / מיזוג / שינוי שם / נראות) קורא ל-revalidateNow מיד אחרי
// כתיבה מוצלחת (src/lib/cacheTags.js). עדכוני התקדמות עמודים (בכל שמירת עמוד) לא מפעילים את התגית
// במכוון — תדירות גבוהה מדי — ומתעדכנים בתוך חלון ה-revalidate. הקטגוריות — בלי מטמון (רשימה קטנה).
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import Book from '@/models/Book'
import Category from '@/models/Category'
import MailingList from '@/models/MailingList'
import Page from '@/models/Page'
import SystemConfig from '@/models/SystemConfig'
import User from '@/models/User'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'

async function loadAdminBooksUncached() {
  await dbConnect()

  const books = await Book.find({})
    .select('name slug totalPages category updatedAt isHidden ownerId originalOwnerId isPrivate')
    .populate('ownerId', 'name')
    .populate('originalOwnerId', 'name')
    .sort({ updatedAt: -1 })
    .lean()

  const stats = await Page.aggregate([
    {
      $group: {
        _id: '$book',
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
      },
    },
  ])
  const statsMap = stats.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr
    return acc
  }, {})

  const formatted = books.map((book) => {
    const bookStats = statsMap[book._id.toString()] || { completed: 0, inProgress: 0 }
    return {
      id: book._id.toString(),
      name: book.name,
      path: book.slug,
      thumbnail: `/uploads/books/${book.slug}/page.1.jpg`,
      totalPages: book.totalPages,
      completedPages: bookStats.completed,
      inProgressPages: bookStats.inProgress,
      category: book.category || 'כללי',
      lastUpdated: book.updatedAt ? new Date(book.updatedAt).toISOString() : null,
      isHidden: book.isHidden || false,
      ownerId: book.ownerId?._id ? book.ownerId._id.toString() : (book.ownerId ? book.ownerId.toString() : null),
      ownerName: book.ownerId?.name || null,
      originalOwnerId: book.originalOwnerId?._id
        ? book.originalOwnerId._id.toString()
        : (book.originalOwnerId ? book.originalOwnerId.toString() : null),
      originalOwnerName: book.originalOwnerId?.name || null,
      isPrivate: book.isPrivate || false,
    }
  })

  // "עיגול" ל-JSON תקני — סריאליזציה בטוחה בגבול Server → Client Component
  return JSON.parse(JSON.stringify(formatted))
}

export const loadAdminBooks = nextCache(loadAdminBooksUncached, ['books-admin-list'], {
  tags: [CACHE_TAGS.BOOKS_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.BOOKS_ADMIN_LIST,
})

/** הקטגוריות ({ name, color }), לפי הסדר שלהן — כמו GET /api/admin/categories */
export async function loadCategories() {
  await dbConnect()
  const list = await Category.find({}).sort({ order: 1 }).lean()
  return list.map((c) => ({ name: String(c.name ?? ''), color: typeof c.color === 'string' ? c.color : null }))
}

/**
 * הספרים והקטגוריות יחד. כשל — error: true (המסך מציג שגיאה ו"נסה שוב", ולא "אין ספרים", שהיה שקר).
 * @returns {Promise<{ books: any[], categories: { name: string, color: string | null }[], error: boolean }>}
 */
export async function loadBooksScreenData() {
  const [books, categories] = await Promise.allSettled([loadAdminBooks(), loadCategories()])
  if (books.status === 'rejected') console.error('Error loading admin books:', books.reason)
  if (categories.status === 'rejected') console.error('Error loading categories:', categories.reason)
  return {
    books: books.status === 'fulfilled' ? books.value : [],
    categories: categories.status === 'fulfilled' ? categories.value : [],
    error: books.status === 'rejected',
  }
}

/** ההנחיות הכלליות — כמו GET /api/admin/books/global-instructions */
export async function loadGlobalInstructions() {
  await dbConnect()
  const config = await SystemConfig.findOne({ key: 'global_editor_instructions' }).lean()
  const value = config?.value
  return JSON.parse(JSON.stringify(value && Array.isArray(value.sections) ? value : { sections: [] }))
}

/**
 * המנויים לעדכונים על ספרים חדשים: כל כתובת ברשימה, עם השם כשיש משתמש עם הכתובת הזו. (GET
 * /api/admin/mailing-list מחזיר רק כתובות של משתמשים רשומים — כאן לא נעלמת כתובת בלי משתמש.)
 * @returns {Promise<{ name: string, email: string }[]>}
 */
export async function loadSubscribers() {
  const emails = await loadSubscriberEmails()
  if (emails.length === 0) return []
  const users = await User.find({ email: { $in: emails } }).select('name email').lean()
  // התאמה בלי הבדל בין אותיות גדולות לקטנות; hasAccount — יש משתמש עם הכתובת (גם בלי שם)
  const byEmail = new Map(users.map((u) => [String(u.email || '').toLowerCase(), u.name || '']))
  return emails.map((email) => {
    const key = email.toLowerCase()
    return { email, name: byEmail.get(key) || '', hasAccount: byEmail.has(key) }
  })
}

/** הכתובות ברשימת המנויים — בלי כפילויות (אותה כתובת פעמיים, גם באותיות שונות, היא מנוי אחד) */
async function loadSubscriberEmails() {
  await dbConnect()
  const list = await MailingList.findOne({ listName: 'new_books_subscribers' }).lean()
  const seen = new Set()
  const out = []
  for (const email of Array.isArray(list?.emails) ? list.emails : []) {
    if (typeof email !== 'string' || !email.trim()) continue
    const key = email.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(email.trim())
  }
  return out
}

/** כמה מנויים יקבלו הודעה כשספר מוצג לכולם — לחלון "להציג את הספר לכולם?". כשל — null (לא מציגים מספר). */
export async function loadSubscriberCount() {
  try {
    return (await loadSubscriberEmails()).length
  } catch (e) {
    console.error('Error loading subscriber count:', e)
    return null
  }
}

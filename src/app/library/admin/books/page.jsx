// עמוד ניהול הספרים (/library/admin/books).
//
// Server Component: רשימת הספרים נשלפת ישירות מה-DB (אותה לוגיקה בדיוק כמו
// /api/library/list, ראו src/app/api/library/list/route.js, בענף isAdmin —
// עמוד זה נגיש רק למנהלים דרך proxy.js, כך שהנתון זהה לכל מי שמגיע לכאן)
// בזמן הרינדור, ולא בקריאת fetch מהדפדפן אחרי הטעינה.
// כל האינטראקציה (סינון, חיפוש, דיאלוגים, פעולות) נשארת ב-AdminBooksClient,
// שממשיך לרענן את עצמו מול ה-API הרגיל אחרי כל פעולת עריכה — בדיוק כפי
// שהתנהג הדף לפני המעבר.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת בזיכרון השרת עם תגית
// BOOKS_ADMIN_LIST וחלון גיבוי קצר. כל route שמשנה ספר (הוספה/מחיקה/מיזוג/
// שינוי שם/נראות) קורא ל-revalidateTag מיד אחרי כתיבה מוצלחת (ראו
// src/lib/cacheTags.js). עדכוני התקדמות עמודים (completedPages/inProgressPages,
// שמתעדכנים בכל שמירת עמוד בודדת) אינם מפעילים revalidateTag במכוון — תדירות
// גבוהה מדי — ומתעדכנים לכשעצמם בתוך חלון ה-revalidate.
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import Book from '@/models/Book'
import Page from '@/models/Page'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import AdminBooksClient from './AdminBooksClient'

// ליטרל מספרי בכוונה (לא REVALIDATE_SECONDS.BOOKS_ADMIN_LIST) — ה-segment
// config של Next נחלץ ע"י ניתוח AST סטטי שלא תומך ב-property access על אובייקט
// מיובא; לעדכן ידנית יחד עם REVALIDATE_SECONDS.BOOKS_ADMIN_LIST.
export const revalidate = 30

async function loadAdminBooksUncached() {
  await dbConnect()

  // עמוד הניהול תמיד רואה את כל הספרים (מקביל לענף isAdmin ב-/api/library/list)
  const books = await Book.find({})
    .select('name slug totalPages category updatedAt isHidden editingInfo ownerId originalOwnerId isPrivate')
    .populate('ownerId', 'name')
    .populate('originalOwnerId', 'name')
    .sort({ updatedAt: -1 })
    .lean()

  const stats = await Page.aggregate([
    {
      $group: {
        _id: '$book',
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        inProgress: {
          $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
        }
      }
    }
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
      availablePages: Math.max(0, book.totalPages - bookStats.completed - bookStats.inProgress),
      category: book.category || 'כללי',
      status: bookStats.completed === book.totalPages ? 'completed' : 'in-progress',
      lastUpdated: book.updatedAt ? new Date(book.updatedAt).toISOString() : null,
      isHidden: book.isHidden || false,
      editingInfo: book.editingInfo || null,

      ownerId: book.ownerId?._id ? book.ownerId._id.toString() : (book.ownerId ? book.ownerId.toString() : null),
      ownerName: book.ownerId?.name || null,
      originalOwnerId: book.originalOwnerId?._id
        ? book.originalOwnerId._id.toString()
        : (book.originalOwnerId ? book.originalOwnerId.toString() : null),
      originalOwnerName: book.originalOwnerId?.name || null,
      isPrivate: book.isPrivate || false
    }
  })

  // "עיגול" ל-JSON תקני: מבטיח סריאליזציה בטוחה בגבול Server->Client Component
  // (ObjectId/Date שנשארו בתוך editingInfo החופשי הופכים למחרוזות, בדיוק כמו
  // שקורה היום דרך NextResponse.json ב-API המקביל).
  return JSON.parse(JSON.stringify(formatted))
}

const loadAdminBooks = nextCache(loadAdminBooksUncached, ['books-admin-list'], {
  tags: [CACHE_TAGS.BOOKS_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.BOOKS_ADMIN_LIST
})

export default async function AdminBooksPage() {
  let initialBooks = []
  try {
    initialBooks = await loadAdminBooks()
  } catch (error) {
    console.error('Error loading admin books:', error)
  }

  return <AdminBooksClient initialBooks={initialBooks} />
}

// עמוד ניהול ספרי הדיקטה (/library/admin/dicta-books).
//
// Server Component: רשימת ספרי הדיקטה נשלפת ישירות מה-DB (אותה לוגיקה בדיוק
// כמו /api/dicta/books, ראו src/app/api/dicta/books/route.js — DictaBook.find({})
// ללא כל סינון לפי משתמש) בזמן הרינדור. עמוד זה נגיש רק למנהלים דרך proxy.js,
// והשאילתה זהה לכל מי שמגיע לכאן. כל האינטראקציה (מיון/סינון/דיאלוגים/פעולות,
// כולל בדיקת ההרשאה הכפולה בצד הלקוח דרך useSession) נשארת ב-
// AdminDictaBooksClient, שממשיך לרענן את עצמו מול ה-API הרגיל אחרי כל פעולה,
// בדיוק כפי שהתנהג הדף לפני המעבר.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת בזיכרון השרת עם תגית
// DICTA_BOOKS_ADMIN_LIST וחלון גיבוי קצר. כל route שמשנה ספר דיקטה (יצירה/
// מחיקה/פיצול/תפיסה/שחרור/עדכון סטטוס/סנכרון מ-GitHub) קורא ל-revalidateTag
// מיד אחרי כתיבה מוצלחת (ראו src/lib/cacheTags.js).
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import DictaBook from '@/models/DictaBook'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import AdminDictaBooksClient from './AdminDictaBooksClient'

// ליטרל מספרי בכוונה (לא REVALIDATE_SECONDS.DICTA_BOOKS_ADMIN_LIST) — ה-segment
// config של Next נחלץ ע"י ניתוח AST סטטי שלא תומך ב-property access על אובייקט
// מיובא; לעדכן ידנית יחד עם REVALIDATE_SECONDS.DICTA_BOOKS_ADMIN_LIST.
export const revalidate = 30

async function loadAdminDictaBooksUncached() {
  await dbConnect()

  // שליפת רשימת הספרים כולל סטטוס ומי תפס (מקביל בדיוק ל-/api/dicta/books)
  const books = await DictaBook.find({}, 'title status claimedBy claimedAt updatedAt')
    .populate('claimedBy', 'name')
    .sort({ updatedAt: -1 })
    .lean()

  // סריאליזציה בטוחה בגבול Server->Client Component (ObjectId/Date -> מחרוזת)
  return JSON.parse(JSON.stringify(books))
}

const loadAdminDictaBooks = nextCache(loadAdminDictaBooksUncached, ['dicta-books-admin-list'], {
  tags: [CACHE_TAGS.DICTA_BOOKS_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.DICTA_BOOKS_ADMIN_LIST
})

export default async function AdminDictaBooksPage() {
  let initialBooks = []
  try {
    initialBooks = await loadAdminDictaBooks()
  } catch (error) {
    console.error('Error loading admin dicta books:', error)
  }

  return <AdminDictaBooksClient initialBooks={initialBooks} />
}

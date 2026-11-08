// עמוד ניהול הספרים (/library/admin/books) — Server Component: הספרים והקטגוריות נשלפים כאן (booksPageData),
// וכל האינטראקציה (סינון, מגירה, דיאלוגים, פעולות) ב-BooksScreen (src/components/admin/books).
import BooksScreen from '@/components/admin/books/BooksScreen'
import { loadBooksScreenData, loadSubscriberCount } from './booksPageData'

// ליטרל מספרי בכוונה (לא REVALIDATE_SECONDS.BOOKS_ADMIN_LIST) — ה-segment config של Next נחלץ בניתוח
// AST סטטי שלא תומך ב-property access על אובייקט מיובא; לעדכן ידנית יחד עם REVALIDATE_SECONDS.BOOKS_ADMIN_LIST.
export const revalidate = 30

export default async function AdminBooksPage() {
  const [{ books, categories, error }, subscriberCount] = await Promise.all([loadBooksScreenData(), loadSubscriberCount()])
  return <BooksScreen initialBooks={books} initialCategories={categories} initialError={error} subscriberCount={subscriberCount} />
}

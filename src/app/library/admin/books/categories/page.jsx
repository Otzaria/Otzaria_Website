// לשונית "קטגוריות" של מסך הספרים (/library/admin/books/categories) — Server Component.
import CategoriesScreen from '@/components/admin/books/CategoriesScreen'
import { loadBooksScreenData } from '../booksPageData'

export const dynamic = 'force-dynamic'

export default async function AdminBookCategoriesPage() {
  const { books, categories, error } = await loadBooksScreenData()
  return <CategoriesScreen initialBooks={books} initialCategories={categories} initialError={error} />
}

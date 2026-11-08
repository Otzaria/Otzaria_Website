// לשונית "מנויים" של מסך הספרים (/library/admin/books/subscribers) — Server Component.
import SubscribersScreen from '@/components/admin/books/SubscribersScreen'
import { loadSubscribers } from '../booksPageData'

export const dynamic = 'force-dynamic'

export default async function AdminBookSubscribersPage() {
  let subscribers = []
  let error = false
  try {
    subscribers = await loadSubscribers()
  } catch (e) {
    console.error('Error loading subscribers:', e)
    error = true
  }
  return <SubscribersScreen initialSubscribers={subscribers} initialError={error} />
}

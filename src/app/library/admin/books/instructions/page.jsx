// לשונית "הנחיות כלליות" של מסך הספרים (/library/admin/books/instructions) — Server Component.
import GlobalInstructionsScreen from '@/components/admin/books/GlobalInstructionsScreen'
import { loadGlobalInstructions } from '../booksPageData'

export const dynamic = 'force-dynamic'

export default async function AdminGlobalInstructionsPage() {
  let instructions = null
  let error = false
  try {
    instructions = await loadGlobalInstructions()
  } catch (e) {
    console.error('Error loading global instructions:', e)
    error = true
  }
  return <GlobalInstructionsScreen initialInstructions={instructions} initialError={error} />
}

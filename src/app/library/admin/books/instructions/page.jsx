// לשונית "הנחיות כלליות" של מסך הספרים (/library/admin/books/instructions) — Server Component.
import GlobalInstructionsScreen from '@/components/admin/books/GlobalInstructionsScreen'
import { loadGlobalFinishQuestions, loadGlobalInstructions } from '../booksPageData'

export const dynamic = 'force-dynamic'

export default async function AdminGlobalInstructionsPage() {
  let instructions = null
  let finishQuestions = null
  let error = false
  try {
    ;[instructions, finishQuestions] = await Promise.all([loadGlobalInstructions(), loadGlobalFinishQuestions()])
  } catch (e) {
    console.error('Error loading global instructions:', e)
    error = true
  }
  return <GlobalInstructionsScreen initialInstructions={instructions} initialFinishQuestions={finishQuestions} initialError={error} />
}

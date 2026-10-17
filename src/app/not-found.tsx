import type { Metadata } from 'next'
import NotFoundHeader from '@/components/notFound/NotFoundHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import NotFoundContent from '@/components/notFound/NotFoundContent'

// noindex מפורש (Next מוסיף אותו גם בעצמו לתשובת 404 — כאן כדי שלא יהיה תלוי בזה)
export const metadata: Metadata = {
  title: 'הדף לא נמצא | אוצריא',
  robots: { index: false, follow: true }
}

// דף 404 הכללי — עיצוב כיוון א' (כמו דף הבית ו-/offline): אותה מעטפת ציבורית, ו-<main> אחד.
// ה-layout הראשי אינו מצייר <main>, ולכן הוא כאן.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <NotFoundHeader />

      <main id="main-content" className="flex flex-1 flex-col">
        <NotFoundContent />
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}

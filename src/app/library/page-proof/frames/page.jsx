'use client'

import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import BookList from '@/components/trainingProof/frames/BookList'

// "הגהה לאימון המודלים" — גלאי אזורי-טקסט: בחירת ספר (docs/75 §2; docs/76 §8.2). ההרשאה נבדקת בשרת
// (/api/training-proof/frames/*); מי שאין לו גישה רואה "אין לך הרשאת גישה לדף זה" עם קישור לבקשת גישה.
export default function FramesBooksPage() {
  const { status } = useRequireAuth()
  return (
    <>
      <Header />
      <main id="main-content" className="w-full px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-content 2xl:max-w-content-wide">
          {status === 'authenticated' ? <BookList /> : <LoadingSpinner />}
        </div>
      </main>
    </>
  )
}

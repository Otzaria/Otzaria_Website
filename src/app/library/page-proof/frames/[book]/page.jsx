'use client'

import { useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import BookWorkspace from '@/components/trainingProof/frames/BookWorkspace'

// גלאי אזורי-טקסט — העבודה על ספר אחד שהמתנדב לקח (docs/75 ה-8…ה-10). <book> = המפתח האטום b-… (לא שם).
export default function FramesBookPage() {
  const { status } = useRequireAuth()
  const { book } = useParams()
  return (
    <>
      <Header />
      <main id="main-content" className="w-full px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-[96rem]">
          {status === 'authenticated' ? <BookWorkspace bookKey={String(book)} /> : <LoadingSpinner />}
        </div>
      </main>
    </>
  )
}

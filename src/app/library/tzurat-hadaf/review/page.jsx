'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import TzuratShell from '@/components/tzuratHadaf/TzuratShell'
import ReviewShell from '@/components/tzuratHadaf/ReviewShell'

// צורת הדף — בדיקת עמוד (?page=id): ארבעה שלבים מול הסריקה של וילנא (CONTRACT: GET pages/[id], PUT draft, POST submit).
function ReviewFromQuery() {
  const params = useSearchParams()
  const id = params.get('page') || ''
  return <ReviewShell key={id} pageId={/^[0-9a-fA-F]{24}$/.test(id) ? id : null} />
}

export default function TzuratReviewPage() {
  return (
    <TzuratShell title="בדיקת עמוד" icon="find_in_page" wide>
      <Suspense fallback={null}>
        <ReviewFromQuery />
      </Suspense>
    </TzuratShell>
  )
}

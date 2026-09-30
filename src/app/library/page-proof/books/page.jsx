'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import ProofBooksList from '@/components/pageProof/books/ProofBooksList'
import ProofAccessNotice from '@/components/pageProof/books/ProofAccessNotice'
import { apiGet } from '@/lib/api-utils'
import { canProof, failMessage } from '@/lib/pageProof/gridState'

// הגהת עמודים — בחירת ספר (כמו /library/books בעריכה הישנה). מכאן נכנסים
// לרשת-העמודים של ספר ותופסים עמוד או רצף. רק למשתמשים מאומתים (כמו דף המתנדב).
export default function PageProofBooksPage() {
  const { session, status } = useRequireAuth()
  const allowed = status === 'authenticated' && canProof(session?.user)
  const [books, setBooks] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!allowed) return undefined
    let cancelled = false
    apiGet('/api/page-proof/books')
      .then((d) => {
        if (!cancelled) setBooks(d.books || [])
      })
      .catch((e) => {
        if (!cancelled) setError(failMessage(e, 'הטעינה נכשלה — בדקו את החיבור ונסו שוב'))
      })
    return () => {
      cancelled = true
    }
  }, [allowed])

  return (
    <div className="flex min-h-screen flex-col bg-background pb-12">
      <Header />
      <main className="container mx-auto flex-1 px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          {status === 'loading' ? (
            <LoadingSpinner message="טוען..." />
          ) : status === 'authenticated' && !allowed ? (
            <ProofAccessNotice />
          ) : allowed ? (
            <ProofBooksList books={books} error={error} />
          ) : null}
        </div>
      </main>
    </div>
  )
}

'use client'

import { useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import ProofBookGrid from '@/components/pageProof/books/ProofBookGrid'
import ProofAccessNotice from '@/components/pageProof/books/ProofAccessNotice'
import { canProof, decodeParam } from '@/lib/pageProof/gridState'

// הגהת עמודים — רשת-העמודים של ספר (כמו /library/books/[path] בעריכה הישנה):
// בוחרים עמוד ("תפוס ועבוד") או רצף של 5, ונכנסים לעורך.
export default function PageProofBookPage() {
  const { session, status } = useRequireAuth()
  const params = useParams()
  const gid = decodeParam(params?.gid)
  const allowed = status === 'authenticated' && canProof(session?.user)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      {status === 'loading' ? (
        <LoadingSpinner message="טוען..." />
      ) : status === 'authenticated' && !allowed ? (
        <div className="container mx-auto px-4 py-8">
          <ProofAccessNotice />
        </div>
      ) : allowed && gid ? (
        <ProofBookGrid key={gid} gid={gid} />
      ) : null}
    </div>
  )
}

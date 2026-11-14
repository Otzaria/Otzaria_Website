'use client'

import TpShell from '@/components/trainingProof/common/TpShell'
import RouterScreen from '@/components/trainingProof/router/RouterScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'

// הגהה לאימון — נתב הכתב: סבב של 30 שורות (components/trainingProof/router)
export default function TrainingProofRouterPage() {
  const { status } = useRequireAuth()
  return (
    <TpShell>
      {status === 'authenticated' ? (
        <RouterScreen />
      ) : (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}
    </TpShell>
  )
}

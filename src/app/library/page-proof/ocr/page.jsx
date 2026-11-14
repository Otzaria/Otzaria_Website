'use client'

import TpShell from '@/components/trainingProof/common/TpShell'
import OcrScreen from '@/components/trainingProof/ocr/OcrScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'

// הגהה לאימון — זיהוי טקסט: סבב של 30 שורות (components/trainingProof/ocr)
export default function TrainingProofOcrPage() {
  const { status } = useRequireAuth()
  return (
    <TpShell>
      {status === 'authenticated' ? (
        <OcrScreen />
      ) : (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}
    </TpShell>
  )
}

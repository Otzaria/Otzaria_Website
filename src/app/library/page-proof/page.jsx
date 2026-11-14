'use client'

import TpShell from '@/components/trainingProof/common/TpShell'
import HubScreen from '@/components/trainingProof/common/HubScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'

// "הגהה לאימון המודלים" (docs/75, docs/76 בפרויקט ה-OCR) — דף סגור: רק מגיהים מאושרים
// (TrainingProofVolunteer) ומנהלי OCR. עד 2026-10 כאן היה דף הגהת-העמודים; הוא יצא
// מהנתיב (docs/76 §8.2, ה-15), והקוד שלו (components/pageProof) עוד במאגר.
export default function TrainingProofHome() {
  const { status } = useRequireAuth()
  return (
    <TpShell wide>
      {status === 'authenticated' ? (
        <HubScreen />
      ) : (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}
    </TpShell>
  )
}

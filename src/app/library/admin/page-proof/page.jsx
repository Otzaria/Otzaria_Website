'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { hasOcrAccess } from '@/lib/roles'
import TrainingProofAdmin from '@/components/trainingProof/admin/TrainingProofAdmin'

// ניהול "הגהה לאימון המודלים" (docs/75 בפרויקט ה-OCR; docs/76 §8.2–§8.3): הכתובת הזו
// מציגה את מסך הניהול החדש, והעורך הישן של הגהת-העמודים כבר לא נפתח ממנה (ה-15).
// הקוד הישן (components/pageProof/*, lib/pageProof/*) נשאר במאגר בחלקו (ה-API ותוכנת-הספר עדיין משתמשים בו); רכיבי הניהול הישנים הוסרו.
// רק מנהל OCR (hasOcrAccess) — וגם כל נתיבי ה-API של המסך בודקים זאת בשרת.
export default function TrainingProofAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const allowed = hasOcrAccess(session?.user?.role)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/login?callbackUrl=/library/admin/page-proof')
    else if (status === 'authenticated' && !allowed) router.push('/library/admin')
  }, [status, allowed, router])

  if (status === 'loading' || !allowed) return <LoadingSpinner message="טוען..." />
  return <TrainingProofAdmin />
}

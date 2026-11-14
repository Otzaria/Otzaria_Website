'use client'

import TzuratShell from '@/components/tzuratHadaf/TzuratShell'
import PracticeRunner from '@/components/tzuratHadaf/PracticeRunner'

// צורת הדף — תרגול קצר לפני המסלול המהיר (CONTRACT: GET/POST /api/tzurat-hadaf/practice).
export default function TzuratPracticePage() {
  return (
    <TzuratShell title="תרגול קצר" icon="school" subtitle="עד עשר שאלות לדוגמה. בסוף תראו את התשובות הנכונות וההסברים.">
      <PracticeRunner />
    </TzuratShell>
  )
}

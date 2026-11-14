'use client'

import TzuratShell from '@/components/tzuratHadaf/TzuratShell'
import FastTrack from '@/components/tzuratHadaf/FastTrack'

// צורת הדף — המסלול המהיר: החלטות נוסח קצרות, כרטיס אחד בכל פעם (CONTRACT: GET /api/tzurat-hadaf/fast).
export default function TzuratFastPage() {
  return (
    <TzuratShell title="החלטות מהירות" icon="quiz" subtitle="מה כתוב בדפוס וילנא? כרטיס אחד בכל פעם — מסתכלים בסריקה ובוחרים.">
      <FastTrack />
    </TzuratShell>
  )
}

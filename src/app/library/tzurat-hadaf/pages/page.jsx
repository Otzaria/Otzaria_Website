'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import TzuratShell from '@/components/tzuratHadaf/TzuratShell'
import PagesGrid from '@/components/tzuratHadaf/PagesGrid'

// צורת הדף — רשת העמודים של מסכת (?m=slug): בוחרים עמוד ולוקחים אותו לבדיקה.
function GridFromQuery() {
  const params = useSearchParams()
  return <PagesGrid slug={params.get('m') || null} />
}

export default function TzuratPagesPage() {
  return (
    <TzuratShell title="בדיקת עמוד — בחירת עמוד" icon="grid_view" subtitle="בחרו עמוד פנוי. הוא יישמר לכם 48 שעות, ואפשר להחזיק עד חמישה עמודים.">
      <Suspense fallback={null}>
        <GridFromQuery />
      </Suspense>
    </TzuratShell>
  )
}

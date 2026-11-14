'use client'

import TzuratShell from '@/components/tzuratHadaf/TzuratShell'
import TzuratLanding from '@/components/tzuratHadaf/TzuratLanding'

// צורת הדף — דף הכניסה למתנדב: מה זה, שני המסלולים, ההתקדמות והתרומות שלי (CONTRACT: GET overview).
export default function TzuratHadafPage() {
  return (
    <TzuratShell title="צורת הדף — השוואה לדפוס" crumb={false}>
      <TzuratLanding />
    </TzuratShell>
  )
}

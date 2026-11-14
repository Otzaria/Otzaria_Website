'use client'

import TzuratShell from '@/components/tzuratHadaf/TzuratShell'
import MineView from '@/components/tzuratHadaf/MineView'

// צורת הדף — "התרומות שלי" (CONTRACT: GET /api/tzurat-hadaf/mine).
export default function TzuratMinePage() {
  return (
    <TzuratShell title="התרומות שלי" icon="emoji_events">
      <MineView />
    </TzuratShell>
  )
}

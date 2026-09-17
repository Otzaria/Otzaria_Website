'use client'

import { useState } from 'react'
import SourcesTab from './SourcesTab'
import OutreachTab from './OutreachTab'

const TABS = [
  { id: 'sources', label: 'מקורות ספרים', icon: 'copyright' },
  { id: 'outreach', label: 'פניות למכונים', icon: 'contact_phone' },
]

/**
 * העמוד מחזיק שתי כרטיסיות: רשומות המקור של הספרים הפרטיים, ורישום הפניות
 * למכונים (כולל פניות מתוכננות) — שתיהן חלקים של אותו תהליך השגת אישורים.
 */
export default function PrivateSourcesPage() {
  const [tab, setTab] = useState('sources')

  return (
    <div className="space-y-6">
      <div className="glass-strong p-2 rounded-xl flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex-1 px-4 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${
              tab === item.id
                ? 'bg-primary text-on-primary'
                : 'text-on-surface hover:bg-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'sources' ? <SourcesTab /> : <OutreachTab />}
    </div>
  )
}

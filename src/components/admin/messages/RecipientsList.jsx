'use client'

import { useState } from 'react'
import ExpandToggle from '@/components/ui/ExpandToggle'
import { formatNumber } from '@/lib/adminTerms'

/**
 * הנמענים של הודעה לכמה משתמשים ("כל המשתמשים") — מקופל; נפתח לרשימה מסודרת: שם בכל שורה, בעמודות, עם גובה
 * מרבי וגלילה פנימית. במשטח אחר מבועות השרשור, כדי שלא ייראה כעוד הודעה. מי שהשיב — נספר כאן (השיחה שלו בנכנסות).
 * @param {{ group: { id: string, recipients: { id: string, name: string | null }[], repliedCount?: number } }} props
 */
export default function RecipientsList({ group }) {
  const [open, setOpen] = useState(false)
  const id = `recipients-${group.id}`
  const n = group.recipients.length
  const replied = Number(group.repliedCount) || 0
  return (
    <section className="flex flex-col gap-2 border-b border-outline-variant/60 pb-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-label-lg text-on-surface">
          נשלחה ל-{formatNumber(n)} נמענים
          {replied > 0 && <span className="text-on-surface-variant"> · {replied === 1 ? 'אחד השיב (בנכנסות)' : `${formatNumber(replied)} השיבו (בנכנסות)`}</span>}
        </h3>
        <ExpandToggle expanded={open} onToggle={() => setOpen((v) => !v)} controls={id} label={open ? 'הסתר' : 'הצג'} ariaLabel={open ? 'הסתר את הנמענים' : 'הצג את הנמענים'} />
      </div>
      {open && (
        <ul id={id} aria-label="הנמענים" className="custom-scrollbar max-h-60 columns-2 gap-x-6 overflow-y-auto rounded-(--radius-control) bg-surface-container-low px-3 py-2 sm:columns-3">
          {group.recipients.map((r) => (
            <li key={r.id} className="break-inside-avoid py-1 text-body-sm text-on-surface [overflow-wrap:anywhere]">{r.name || 'משתמש שנמחק'}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

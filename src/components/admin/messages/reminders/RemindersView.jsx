'use client'

import { useEffect, useState } from 'react'
import ReminderHistoryList from './ReminderHistoryList'
import ReminderUserSelectionModal from './ReminderUserSelectionModal'
import ReminderWizard from './ReminderWizard'
import { useReminders } from './useReminders'

/**
 * "הודעות › תזכורות" — תזכורת בדואר לעורכים שתפסו עמודים בספר ולא סיימו (היה המסך /library/admin/reminders).
 * למנהל כללי ולמנהל ספרים בלבד — כמו קודם (הבדיקה אצל MessagesScreen; השרת אוכף ב-hasBooksAccess).
 * האשף (ReminderWizard) ולצידו, ברוחב גדול, "תזכורות שנשלחו"; בטלפון — זה מתחת לזה.
 * refreshRef — "רענן" שבכותרת המסך: כאן — הספרים וההיסטוריה.
 *
 * @param {{ confirm: Function, toast: any, refreshRef?: { current: (() => void) | null } }} props
 */
export default function RemindersView({ confirm, toast, refreshRef }) {
  const r = useReminders({ confirm, toast })
  const [picking, setPicking] = useState(false)
  const { reloadAll } = r
  useEffect(() => {
    if (!refreshRef) return undefined
    refreshRef.current = reloadAll
    return () => { refreshRef.current = null }
  })
  return (
    <div className="@container">
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <p className="text-body-md text-on-surface-variant">תזכורת בדואר לעורכים שתפסו עמודים בספר ועוד לא סיימו אותם.</p>
          <ReminderWizard r={r} onPick={() => setPicking(true)} />
        </div>
        <ReminderHistoryList
          loading={r.history.status === 'loading'}
          history={r.history.list}
          error={r.history.status === 'error' ? r.history.error : null}
          onRetry={() => r.history.reload()}
          onDelete={r.removeHistory}
        />
      </div>
      {picking && (
        <ReminderUserSelectionModal
          users={r.found}
          selected={r.recipients}
          onToggle={r.toggleRecipient}
          onSelectAll={r.selectAll}
          onSelectNone={r.selectNone}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

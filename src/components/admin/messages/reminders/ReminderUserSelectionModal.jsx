'use client'

import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Checkbox from '@/components/ui/Checkbox'
import { cx } from '@/components/ui/cx'
import { editorsText } from '@/lib/adminMessagesScreen/messageTerms'

/**
 * בחירת עורכים לתזכורת — מתוך מי שנמצא עובד על הספר. כל שורה: תיבת סימון, השם והדואר; "בחר הכול" ו"נקה"
 * למעלה; "אישור (3)" סוגר (הבחירה כבר נשמרת בכל לחיצה, כמו קודם). חלון משותף (ui/Dialog): Esc ורקע סוגרים,
 * גיליון תחתון בטלפון.
 *
 * @param {{ users: { email: string, name: string }[], selected: string[], onToggle: (email: string) => void,
 *   onSelectAll: () => void, onSelectNone: () => void, onClose: () => void }} props
 */
export default function ReminderUserSelectionModal({ users, selected, onToggle, onSelectAll, onSelectNone, onClose }) {
  const all = users.length > 0 && users.every((u) => selected.includes(u.email))
  return (
    <Dialog
      title="בחר עורכים"
      subtitle={`נבחרו ${selected.length} מתוך ${editorsText(users.length)}`}
      onClose={onClose}
      footer={<Button variant="filled" size="sm" onClick={onClose} data-autofocus="">אישור ({selected.length})</Button>}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <Button variant="text" size="sm" icon="done_all" onClick={onSelectAll} disabled={all}>בחר הכול</Button>
          <Button variant="text" size="sm" icon="close" onClick={onSelectNone} disabled={selected.length === 0}>נקה</Button>
        </div>
        <ul className="flex flex-col">
          {users.map((user) => {
            const checked = selected.includes(user.email)
            return (
              <li key={user.email} className={cx('flex min-h-14 items-center gap-1 rounded-(--radius-control) pe-3 transition-colors hover:bg-surface-selected', checked && 'bg-surface-selected')}>
                <Checkbox label={`${user.name} (${user.email})`} checked={checked} onChange={() => onToggle(user.email)} />
                {/* לחיצה על השם בוחרת גם היא (aria-hidden — השם הנגיש כבר על תיבת הסימון) */}
                <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => onToggle(user.email)} className="min-w-0 flex-1 cursor-pointer py-2 text-start">
                  <span className="block truncate text-label-lg text-on-surface">{user.name}</span>
                  <span dir="ltr" className="block truncate text-end text-body-sm text-on-surface-variant"><bdi>{user.email}</bdi></span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}

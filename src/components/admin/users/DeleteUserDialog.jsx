'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Ltr from '@/components/ui/Ltr'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { deleteConfirmed, deleteImpact, displayName } from '@/lib/adminUsersScreen/userTerms'

/**
 * "מחק לצמיתות" — חלון שבו מקלידים את כתובת הדואר של המשתמש כדי לאשר (במקום window.confirm). מה המחיקה
 * עושה בשרת (api/admin/users, DELETE): החשבון נמחק, וכל העמודים שמשויכים אליו — גם אלה שהושלמו — חוזרים
 * להיות פנויים; כמה, ומה זה עושה לספרים — במספרים שכבר יש ברשימה (deleteImpact). "מחק לצמיתות" מושבת עד
 * שהכתובת זהה; כשל — בתוך החלון. בזמן מחיקה אי אפשר לסגור.
 *
 * @param {{ user: any, remove: (user: any) => Promise<unknown>, onClose: () => void, onDeleted: (user: any) => void }} props
 *   remove — המחיקה עצמה (useUserWrites.remove: בתור, אחרי בקשות שכבר יצאו)
 */
export default function DeleteUserDialog({ user, remove: removeUser, onClose, onDeleted }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fieldId = useId()
  const hintId = useId()
  const errorId = useId()
  const name = displayName(user)
  const ready = deleteConfirmed(typed, user.email)

  const remove = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      await removeUser(user)
      onDeleted(user)
    } catch (e) {
      setError(e?.message || 'לא הצלחנו למחוק את המשתמש.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={`למחוק לצמיתות את ${name}?`}
      onClose={onClose}
      dismissible={!busy}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={busy}>ביטול</Button>
          <Button variant="danger" size="sm" icon="delete_forever" onClick={remove} loading={busy} disabled={!ready}>
            {busy ? 'מוחק…' : 'מחק לצמיתות'}
          </Button>
        </>
      )}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); remove() }}>
        <ul className="flex list-disc flex-col gap-1 ps-5 text-body-md text-on-surface-variant">
          <li>החשבון יימחק, והמשתמש לא יוכל להתחבר.</li>
          {deleteImpact(user).map((line) => <li key={line}>{line}</li>)}
          <li>אי אפשר לשחזר. כדי רק לעצור אותו — אפשר לשנות לו את התפקיד או לחסום אותו מעריכה.</li>
        </ul>
        <div>
          <label htmlFor={fieldId} className={FIELD_LABEL}>כדי לאשר, הקלד את כתובת הדואר שלו</label>
          <p id={hintId} className={`${FIELD_HINT} mt-0 mb-2`}><Ltr>{user.email}</Ltr></p>
          <input
            id={fieldId}
            type="email"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setError('') }}
            disabled={busy}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={[hintId, error && errorId].filter(Boolean).join(' ')}
            className={fieldClasses({ invalid: Boolean(error), className: 'text-start' })}
            data-autofocus=""
          />
          {error && <p id={errorId} role="alert" className={FIELD_ERROR}>{error}</p>}
        </div>
      </form>
    </Dialog>
  )
}

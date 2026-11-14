'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { CHECKBOX, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { BLOCK_EXPLANATION, blockedMessage } from '@/lib/adminSuggestions/suggestionTerms'
import { blockUser } from './suggestionsApi'

/**
 * "חסום מעריכה" — כמו קודם (סיבה לא חובה, ו"דחה גם את ההצעות שלו שממתינות" מסומן מראש), בחלון האישור החדש:
 * כפתור האישור באדום, והפוקוס הראשון על "ביטול". כשל — בתוך החלון; בזמן הבקשה אי אפשר לסגור.
 * (מגירת משתמש עם החסימה תבוא בשלב "משתמשים".)
 *
 * @param {{ target: { id: string, name: string }, onClose: () => void, onDone: (message: string) => void }} props
 */
export default function BlockUserDialog({ target, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [rejectPending, setRejectPending] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reasonId = useId()
  const checkId = useId()

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await blockUser(target.id, { reason, rejectPending })
      onDone(blockedMessage(target.name, data?.rejected || 0))
    } catch (e) {
      setError(e?.message || 'לא הצלחנו לחסום את המשתמש.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="לחסום מעריכה?"
      subtitle={<bdi className="[overflow-wrap:anywhere]">{target.name}</bdi>}
      onClose={onClose}
      dismissible={!busy}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={busy} data-autofocus="">ביטול</Button>
          <Button variant="danger" size="sm" onClick={submit} loading={busy}>{busy ? 'חוסם…' : 'חסום מעריכה'}</Button>
        </>
      )}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <p className="text-center text-body-md text-on-surface-variant">{BLOCK_EXPLANATION}</p>
        <div>
          <label htmlFor={reasonId} className={FIELD_LABEL}>סיבה (לא חובה)</label>
          <input id={reasonId} type="text" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} className={fieldClasses({})} />
        </div>
        <label htmlFor={checkId} className="flex cursor-pointer items-start gap-3 text-body-md text-on-surface">
          <input id={checkId} type="checkbox" checked={rejectPending} onChange={(e) => setRejectPending(e.target.checked)} disabled={busy} className={CHECKBOX} />
          דחה גם את כל ההצעות שלו שממתינות
        </label>
        {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
      </form>
    </Dialog>
  )
}

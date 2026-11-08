'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { formatNumber } from '@/lib/adminBooks/bookTerms'
import QuotedName from './QuotedName'

/**
 * "הצג" לספר מוסתר — חשיפה לקהל, עם בחירה מפורשת אם לשלוח הודעה במייל למנויים (אי אפשר להחזיר
 * הודעה שנשלחה, ולכן זו לא תיבת סימון שנשכחת מסומנת). הכפתור הבולט — "הצג בלי הודעה" (הפעולה
 * הבטוחה; החלטת המשתמש), ו"הצג ושלח הודעה" משני, ומעליו כמה מנויים יקבלו את ההודעה. בזמן העדכון אי
 * אפשר לסגור, והכפתור שנלחץ מציג טעינה.
 *
 * @param {{ book: any, subscriberCount?: number | null, onConfirm: (book: any, sendNotification: boolean) => Promise<boolean>,
 *   onClose: () => void }} props
 */
export default function ShowBookDialog({ book, subscriberCount = null, onConfirm, onClose }) {
  const [busy, setBusy] = useState(null) // null | 'silent' | 'notify'

  const confirm = async (notify) => {
    if (busy) return
    setBusy(notify ? 'notify' : 'silent')
    const ok = await onConfirm(book, notify)
    if (ok) onClose()
    else setBusy(null)
  }

  return (
    <Dialog
      title="להציג את הספר לכולם?"
      onClose={onClose}
      dismissible={!busy}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={Boolean(busy)}>ביטול</Button>
          <Button variant="outlined" size="sm" icon="send" onClick={() => confirm(true)} loading={busy === 'notify'} disabled={busy === 'silent'}>הצג ושלח הודעה</Button>
          <Button variant="filled" size="sm" onClick={() => confirm(false)} loading={busy === 'silent'} disabled={busy === 'notify'}>הצג בלי הודעה</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3 text-center text-body-md text-on-surface-variant">
        <p><QuotedName name={book.name} /> יופיע בספרייה לכל המשתמשים.</p>
        <p>אפשר גם לשלוח למנויים הודעה במייל על הספר. הודעה שנשלחה אי אפשר להחזיר.</p>
        {typeof subscriberCount === 'number' && (
          <p className="text-on-surface">
            {subscriberCount === 0 ? 'אין כרגע מנויים — הודעה לא תגיע לאף אחד.' : subscriberCount === 1 ? 'מנוי אחד יקבל את ההודעה.' : `${formatNumber(subscriberCount)} מנויים יקבלו את ההודעה.`}
          </p>
        )}
      </div>
    </Dialog>
  )
}

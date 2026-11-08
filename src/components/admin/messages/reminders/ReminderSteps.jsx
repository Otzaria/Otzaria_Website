'use client'

import { useId } from 'react'
import Button from '@/components/ui/Button'
import Loader from '@/components/ui/Loader'
import Notice from '@/components/ui/Notice'
import SelectMenu from '@/components/ui/SelectMenu'
import { FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import AppIcon from '@/components/ui/AppIcon'
import { EMAIL_DELIVERY, editorsText } from '@/lib/adminMessagesScreen/messageTerms'
import { UNCERTAIN_SEND_TEXT, bookOptions, editorsFoundText, reminderSubject } from '@/lib/adminMessagesScreen/reminderWizard'

/** שלב 1 — ספר: בורר עם חיפוש, רק ספרים שיש בהם עמודים בעבודה; מתחתיו — כמה עורכים יקבלו (כמו במסך הקודם) */
export function BookStep({ r }) {
  const loading = r.books.status === 'loading'
  const found = editorsFoundText({ bookPath: r.bookPath, checking: r.checking || r.users.status === 'loading', found: r.found, error: r.checkError || r.users.error })
  return (
    <div className="flex flex-col gap-2">
      <SelectMenu
        labelSize="lg"
        label="על איזה ספר?"
        options={bookOptions(r.books.list)}
        value={r.bookPath}
        onChange={r.chooseBook}
        searchable
        searchPlaceholder="חפש ספר"
        placeholder={loading ? 'טוען את רשימת הספרים…' : 'בחר ספר'}
        disabled={r.books.status !== 'ready'}
        highlight={false}
        emptyText="לא נמצא ספר"
      />
      {found ? (
        <p role="status" className={`${FIELD_HINT} flex items-center gap-1.5 text-on-surface!`}>
          {r.checking ? <Loader size="inline" decorative /> : <AppIcon name={r.found.length > 0 ? 'group' : 'info'} className="text-icon-sm text-on-surface-variant" />}
          {found}
        </p>
      ) : (
        <p className={FIELD_HINT}>מוצגים רק ספרים שעורכים עובדים עליהם עכשיו.</p>
      )}
      {r.books.status === 'error' && (
        <Notice tone="error" role="alert" action={<Button variant="text" size="sm" icon="refresh" onClick={() => r.books.reload()}>נסה שוב</Button>}>
          {r.books.error?.message || 'לא הצלחנו לטעון את רשימת הספרים.'}
        </Notice>
      )}
      {r.books.status === 'ready' && r.books.list.length === 0 && (
        <p className="rounded-(--radius-control) bg-surface-container-low p-3 text-body-sm text-on-surface-variant">אין כרגע ספר שעורכים עובדים עליו, ולכן אין למי לשלוח תזכורת.</p>
      )}
    </div>
  )
}

/** שלב 2 — נמענים: מי עובד על הספר ומאשר תזכורות, וכמה נבחרו; "בחר עורכים" פותח את חלון הבחירה */
export function RecipientsStep({ r, onPick }) {
  if (r.users.status === 'error') {
    return (
      <Notice tone="error" role="alert" action={<Button variant="text" size="sm" icon="refresh" onClick={() => r.users.reload()}>נסה שוב</Button>}>
        {r.users.error?.message || 'לא הצלחנו לטעון את רשימת המשתמשים, ובלעדיה אי אפשר לדעת למי לשלוח.'}
      </Notice>
    )
  }
  if (r.checking || r.users.status === 'loading') {
    return (
      <p role="status" className="flex min-h-12 items-center gap-2 text-body-md text-on-surface-variant">
        <Loader size="inline" decorative /> בודק מי עובד על הספר…
      </p>
    )
  }
  if (r.checkError) {
    return (
      <Notice tone="error" role="alert" action={<Button variant="text" size="sm" icon="refresh" onClick={r.recheck}>נסה שוב</Button>}>
        {r.checkError.message}
      </Notice>
    )
  }
  if (r.found.length === 0) {
    return (
      <Notice tone="warning" title="אין למי לשלוח">
        אף עורך לא עובד עכשיו על הספר הזה, או שמי שעובד עליו לא מאשר תזכורות. אפשר לבחור ספר אחר.
      </Notice>
    )
  }
  const chosen = r.found.filter((u) => r.recipients.includes(u.email))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-md text-on-surface">
        {r.found.length === 1 ? 'נמצא עורך אחד' : `נמצאו ${editorsText(r.found.length)}`} שעובדים על הספר ומאשרים תזכורות.
        {' '}<span className="text-on-surface-variant">{r.recipients.length === r.found.length ? 'כולם נבחרו.' : `נבחרו ${r.recipients.length}.`}</span>
      </p>
      {chosen.length > 0 && (
        <ul aria-label="הנמענים שנבחרו" className="flex flex-wrap gap-2">
          {chosen.map((u) => (
            <li key={u.email} className="rounded-(--radius-pill) bg-surface-container px-3 py-1 text-label-md text-on-surface">{u.name}</li>
          ))}
        </ul>
      )}
      {r.found.length > 1 && (
        <div>
          <Button variant="outlined" size="sm" icon="group" onClick={onPick}>בחר עורכים</Button>
        </div>
      )}
      {r.recipients.length === 0 && <p role="alert" className="text-body-sm text-error">לא נבחר אף עורך.</p>}
    </div>
  )
}

/** שלב 3 — תוכן: הטקסט (נכנס לתבנית קבועה), ולפני השליחה — סיכום שקט: למי, על איזה ספר, נושא המייל ואיך מגיע */
export function ContentStep({ r }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor={id} className={FIELD_LABEL}>תוכן התזכורת</label>
        <textarea
          id={id}
          value={r.message}
          onChange={(e) => r.setMessage(e.target.value)}
          rows={6}
          aria-describedby={`${id}-hint`}
          className={fieldClasses({ kind: 'textarea', className: 'resize-y' })}
          disabled={r.sending}
        />
        <p id={`${id}-hint`} className={FIELD_HINT}>הטקסט נכנס לתבנית קבועה: כותרת עם שם הספר, וכפתור לכניסה לספרייה.</p>
      </div>
      <section aria-label="סיכום לפני שליחה" className="flex gap-3 rounded-(--radius-control) bg-surface-container-low p-3 sm:p-4">
        <AppIcon name="forward_to_inbox" className="mt-0.5 shrink-0 text-icon-lg text-primary" />
        <div className="min-w-0 text-body-sm text-on-surface-variant">
          <p className="text-label-lg text-on-surface [overflow-wrap:anywhere]">אל {editorsText(r.recipients.length)} · על "{r.book?.name || ''}"</p>
          <p className="mt-1 [overflow-wrap:anywhere]">נושא המייל: {reminderSubject(r.book?.name || '')}</p>
          <p className="mt-1">{EMAIL_DELIVERY}</p>
        </div>
      </section>
      {r.sendError && (
        <Notice tone={r.sendUncertain ? 'warning' : 'error'} role="alert" title={r.sendUncertain ? 'לא ידוע אם התזכורת יצאה' : 'התזכורת לא נשלחה'}>
          {r.sendError.message}{r.sendUncertain ? ` ${UNCERTAIN_SEND_TEXT}` : ''}
        </Notice>
      )}
    </div>
  )
}

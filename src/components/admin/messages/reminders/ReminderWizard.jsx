'use client'

import { useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Stepper, { STEPPER_COMPLETE } from '@/components/ui/Stepper'
import { toEditorsText } from '@/lib/adminMessagesScreen/messageTerms'
import { REMINDER_STEPS, canAdvance } from '@/lib/adminMessagesScreen/reminderWizard'
import { BookStep, ContentStep, RecipientsStep } from './ReminderSteps'

const ORDER = REMINDER_STEPS.map((s) => s.id)

/** אחרי שליחה: מה יצא, ו"תזכורת חדשה" */
function SentPanel({ r }) {
  return (
    <div role="status" className="flex flex-col items-start gap-3">
      <p className="text-title-md text-on-surface">התזכורת נשלחה</p>
      <p className="text-body-md text-on-surface-variant">{r.sent.text}</p>
      <Button variant="tonal" size="sm" icon="forward_to_inbox" onClick={r.startOver}>תזכורת חדשה</Button>
    </div>
  )
}

/**
 * האשף של "תזכורות": שלבים (ui/Stepper) — ספר → נמענים → תוכן ושליחה. "הבא" פתוח רק כשהשלב מוכן; "חזרה" ושלב
 * שהושלם בשורת השלבים מחזירים אחורה (לא בזמן שליחה). בשלב האחרון — "שלח תזכורת ל-4 עורכים", הכפתור הבולט
 * היחיד במסך. במעבר שלב — הפוקוס עובר לכותרת השלב. אחרי שליחה — כל השלבים מסומנים כהושלמו.
 *
 * @param {{ r: ReturnType<typeof import('./useReminders').useReminders>, onPick: () => void }} props
 */
export default function ReminderWizard({ r, onPick }) {
  const index = ORDER.indexOf(r.step)
  const current = REMINDER_STEPS[index]
  const ready = canAdvance(r.step, { bookPath: r.bookPath, checking: r.checking, recipients: r.recipients, message: r.message })
  const headingRef = useRef(null)
  const moved = useRef(false)
  useEffect(() => {
    if (moved.current) headingRef.current?.focus()
  }, [r.step])
  const go = (id) => {
    moved.current = true
    r.setStep(id)
  }

  return (
    <Card as="section" padding="none" aria-label="שליחת תזכורת" className="flex flex-col gap-5 p-4 sm:p-6">
      <Stepper label="שלבי שליחת תזכורת" steps={REMINDER_STEPS} current={r.sent ? STEPPER_COMPLETE : r.step} onSelect={go} disabled={r.sending || Boolean(r.sent)} />
      {r.sent ? <SentPanel r={r} /> : (
        <>
          {/* השם של השלב כבר גלוי בשורת השלבים — הכותרת לקורא המסך, ויעד הפוקוס במעבר שלב */}
          <h2 id="reminder-step-title" ref={headingRef} tabIndex={-1} className="sr-only">
            שלב {index + 1} מתוך {ORDER.length}: {current.label}
          </h2>
          {r.step === 'book' && <BookStep r={r} />}
          {r.step === 'recipients' && <RecipientsStep r={r} onPick={onPick} />}
          {r.step === 'content' && <ContentStep r={r} />}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/60 pt-4">
            {index > 0 ? (
              <Button variant="text" size="sm" icon="chevron_right" onClick={() => go(ORDER[index - 1])} disabled={r.sending}>חזרה</Button>
            ) : <span />}
            {r.step === 'content' ? (
              <Button variant="filled" size="sm" icon="send" onClick={r.send} loading={r.sending} disabled={!ready}>
                {r.sending ? 'שולח…' : `שלח תזכורת ${toEditorsText(r.recipients.length)}`}
              </Button>
            ) : (
              <Button variant="filled" size="sm" iconEnd="chevron_left" onClick={() => go(ORDER[index + 1])} disabled={!ready}>הבא</Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

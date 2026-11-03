'use client'

import { useEffect, useId, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import IconTile from '@/components/ui/IconTile'
import Kbd from '@/components/ui/Kbd'
import { cx } from '@/components/ui/cx'
import { FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { buildFinishChecks } from './editorStatusText'

/**
 * האם אירוע מקלדת הוא Ctrl/⌘+Enter "אמיתי" שנלחץ אחרי שהחלון נפתח.
 * לא נספר: חזרה אוטומטית של מקש מוחזק (repeat), ואירוע שנוצר לפני ה-mount — כך הלחיצה
 * שפתחה את החלון (Ctrl+Enter בעורך) לא מסיימת את העמוד מיד.
 */
export function isFreshSubmitChord(event, mountedAt) {
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return false
  if (event.repeat) return false
  if (typeof event.timeStamp === 'number' && event.timeStamp > 0 && event.timeStamp < mountedAt) return false
  return true
}

/**
 * חלון "סיום עמוד" (על ui/Dialog): בדיקות לפני שהעמוד עובר לבודק — מילים חשודות שלא נבדקו
 * (עם "עבור אליהן"), שורות בטקסט מול שורות בצילום, מצב השמירה — והערה לבודק.
 * הבדיקות מתריעות ואינן חוסמות. הפעולה הראשית: "סיים ועבור לעמוד הבא" (גם Ctrl+Enter).
 *
 * הפוקוס נכנס לחלון עצמו (לא לכפתור הראשי), ו-Ctrl+Enter נספר רק אם נלחץ אחרי הפתיחה.
 *
 * @param {{
 *   bookTitle: string, pageNumber: number,
 *   suspectCount?: number, onGoToSuspects?: () => void,
 *   textLineCount: number, scanLineCount?: number | null,
 *   saveStatus: 'saved'|'saving'|'dirty'|'error', lastSavedAt?: Date|number|string|null,
 *   initialNote?: string, onSubmit: (result: { note: string }) => void, submitting?: boolean,
 *   onClose: () => void, showNote?: boolean, submitLabel?: string, children?: import('react').ReactNode
 * }} props
 * showNote — שדה ההערה לבודק (כבוי כל עוד אין לו יעד בשרת); submitLabel — נוסח הפעולה הראשית;
 * children — תוכן נוסף מתחת לבדיקות (למשל "מה יקרה" בזרימת ההעלאה הקיימת).
 */
export default function FinishPageDialog({
  bookTitle,
  pageNumber,
  suspectCount = 0,
  onGoToSuspects,
  textLineCount,
  scanLineCount = null,
  saveStatus,
  lastSavedAt = null,
  initialNote = '',
  onSubmit,
  submitting = false,
  onClose,
  showNote = true,
  submitLabel = 'סיים ועבור לעמוד הבא',
  children
}) {
  const noteId = useId()
  const [note, setNote] = useState(initialNote)
  const [mountedAt] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0))
  const checks = buildFinishChecks({ suspectCount, textLineCount, scanLineCount, saveStatus, lastSavedAt })

  const submitRef = useRef(() => {})
  useEffect(() => {
    submitRef.current = () => { if (!submitting) onSubmit({ note: note.trim() }) }
  })

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!isFreshSubmitChord(event, mountedAt)) return
      event.preventDefault()
      submitRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mountedAt])

  return (
    <Dialog
      title="סיום עמוד"
      subtitle={`${bookTitle} · עמוד ${pageNumber}. עבור על הבדיקות לפני שהעמוד עובר לבודק.`}
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <span className="me-auto hidden items-center gap-1.5 text-body-sm text-on-surface-variant sm:inline-flex">
            <Kbd keys={['Ctrl', 'Enter']} />
          </span>
          <Button variant="text" onClick={onClose} disabled={submitting}>חזור לעריכה</Button>
          <Button variant="filled" icon="check" loading={submitting} aria-keyshortcuts="Control+Enter" onClick={() => submitRef.current()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <ul aria-label="בדיקות לפני הסיום" className="space-y-2">
        {checks.map((check) => (
          <FinishCheckItem
            key={check.id}
            check={check}
            action={check.action === 'suspects' && onGoToSuspects
              ? <Button variant="text" size="sm" onClick={onGoToSuspects}>עבור אליהן</Button>
              : null}
          />
        ))}
      </ul>

      {children}

      {showNote && (
        <div className="mt-5">
          <label htmlFor={noteId} className={FIELD_LABEL}>הערה לבודק (לא חובה)</label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="למשל: בשורה 12 יש כתם, לא בטוח באות"
            className={fieldClasses({ kind: 'textarea', className: 'min-h-24' })}
          />
        </div>
      )}
    </Dialog>
  )
}

function FinishCheckItem({ check, action }) {
  return (
    <li className={cx('flex items-center gap-3 rounded-(--radius-card) bg-surface p-3', !check.ok && 'outline-1 -outline-offset-1 outline-outline-variant')}>
      {check.ok ? (
        <IconTile icon={check.icon} size="sm" />
      ) : (
        // אריח בגוון אזהרה — IconTile לא מקבל דריסת צבע (אין tailwind-merge)
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-(--icon-tile-radius) bg-warning-container text-(length:--icon-size-sm) text-on-warning-container">
          <AppIcon name={check.icon} className="[font-size:inherit]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-title-sm text-on-surface">
          {check.title}
          {!check.ok && <span className="sr-only"> (לבדיקה)</span>}
        </p>
        {check.detail && <p className="text-body-sm text-on-surface-variant">{check.detail}</p>}
      </div>
      {action}
    </li>
  )
}

import { useEffect, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { CHECKBOX } from '@/components/ui/fieldStyles'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { cx } from '@/components/ui/cx'

function hasSections(group) {
  return Boolean(group?.sections?.length)
}

function InstructionGroup({ group, fallbackTitle }) {
  return (
    <section>
      <h3 className="mb-3 border-s-4 border-primary ps-2 text-title-sm text-on-surface">{group.title || fallbackTitle}</h3>
      <div className="space-y-4">
        {group.sections.map((section, idx) => (
          <div key={idx} className="rounded-(--radius-card) border border-outline-variant bg-surface p-4">
            <h4 className="mb-3 flex items-center gap-2 border-b border-outline-variant pb-2 text-title-sm text-primary">
              <AppIcon name="check_circle" className="text-xl" />
              {section.title}
            </h4>
            <ul className="space-y-2">
              {section.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2 text-body-md text-on-surface">
                  <AppIcon name="arrow_left" className="mt-0.5 shrink-0 text-lg text-primary" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/** הנחיות העריכה (לספר + כלליות). ui/Dialog: פוקוס, Esc, לכידת Tab. onClose(dontShowAgain). */
export default function InfoDialog({ isOpen, onClose, bookInstructions, globalInstructions, examplePage, bookPath }) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    // איפוס תיבת "אל תציג שוב" בכל פתיחה
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setDontShowAgain(false)
  }, [isOpen])

  if (!isOpen) return null

  const handleClose = () => onClose(dontShowAgain)
  const hasBook = hasSections(bookInstructions)
  const hasGlobal = hasSections(globalInstructions)
  const hasExample = Boolean(examplePage && bookPath)

  return (
    <Dialog
      title="הנחיות עריכה"
      onClose={handleClose}
      className="sm:max-w-2xl"
      footer={
        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-h-(--touch-target) cursor-pointer select-none items-center gap-2 text-body-md text-on-surface">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} className={cx(CHECKBOX, 'mt-0')} />
            אל תציג שוב לספר זה
          </label>
          <Button variant="filled" icon="check" onClick={handleClose}>הבנתי, בוא נתחיל!</Button>
        </div>
      }
    >
      <div className="space-y-6">
        {hasBook && <InstructionGroup group={bookInstructions} fallbackTitle="הנחיות לספר זה" />}

        {hasExample && (
          <a
            href={`/library/books/${encodeURIComponent(bookPath)}/example`}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(
              'flex items-center gap-3 rounded-(--radius-card) border border-outline-variant bg-surface p-4 text-on-surface transition-colors hover:bg-surface-selected',
              FOCUS_RING
            )}
          >
            <AppIcon name="bookmark" className="text-2xl text-primary" />
            <span className="flex flex-1 flex-col">
              <span className="text-title-sm">צפה בעמוד הדוגמה</span>
              <span className="text-body-sm text-on-surface-variant">נפתח בכרטיסייה חדשה</span>
            </span>
            <AppIcon name="open_in_new" className="text-xl text-on-surface-variant" />
          </a>
        )}

        {hasGlobal && <InstructionGroup group={globalInstructions} fallbackTitle="הנחיות מערכת" />}

        {!hasBook && !hasGlobal && !hasExample && (
          <div className="flex flex-col items-center py-8 text-center">
            <AppIcon name="menu_book" className="text-4xl text-on-surface-variant" />
            <p className="mt-3 text-title-sm text-on-surface">אין עדיין הנחיות לספר זה</p>
            <p className="mt-1 max-w-measure text-body-md text-on-surface-variant">ערוך את הטקסט כך שיתאים לצילום, שורה מול שורה. בשאלה — פנה למנהל הספר.</p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { cx } from '@/components/ui/cx'
import { FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'

const MODES = [
  { value: 'content', title: 'פיצול תוכן', hint: 'העמוד מכיל שני חלקים שונים של טקסט (למשל גמרא ורש"י).' },
  { value: 'visual', title: 'חלוקה חזותית', hint: 'רק לנוחות העריכה (למשל שני טורים של אותו טקסט).' },
]

/** "פיצול לשני טורים" — בחירת סוג הפיצול ושמות הטורים. ui/Dialog: פוקוס, Esc, לכידת Tab. */
export default function SplitDialog({
  isOpen,
  onClose,
  splitMode,
  setSplitMode,
  rightColumnName,
  setRightColumnName,
  leftColumnName,
  setLeftColumnName,
  confirmSplit
}) {
  if (!isOpen) return null

  return (
    <Dialog
      title="פיצול לשני טורים"
      subtitle="בחר את סוג הפיצול לעמוד זה"
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={onClose}>ביטול</Button>
          <Button variant="filled" icon="call_split" onClick={confirmSplit}>פיצול לשני טורים</Button>
        </>
      }
    >
      <fieldset className="space-y-3">
        <legend className="sr-only">סוג הפיצול</legend>
        {MODES.map((mode) => (
          <label
            key={mode.value}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-(--radius-card) border p-4 transition-colors',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring',
              splitMode === mode.value ? 'border-primary bg-surface-selected' : 'border-outline-variant hover:bg-surface-container'
            )}
          >
            <input
              type="radio"
              name="splitMode"
              value={mode.value}
              checked={splitMode === mode.value}
              onChange={(e) => setSplitMode(e.target.value)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="block text-label-lg text-on-surface">{mode.title}</span>
              <span className="text-body-sm text-on-surface-variant">{mode.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {splitMode === 'content' && (
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="split-right-name" className={FIELD_LABEL}>כותרת הטור הימני</label>
            <input id="split-right-name" type="text" value={rightColumnName} onChange={(e) => setRightColumnName(e.target.value)} className={fieldClasses()} placeholder="חלק 1" />
          </div>
          <div>
            <label htmlFor="split-left-name" className={FIELD_LABEL}>כותרת הטור השמאלי</label>
            <input id="split-left-name" type="text" value={leftColumnName} onChange={(e) => setLeftColumnName(e.target.value)} className={fieldClasses()} placeholder="חלק 2" />
          </div>
        </div>
      )}
    </Dialog>
  )
}

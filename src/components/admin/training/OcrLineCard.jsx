'use client'

import { memo, useId, useMemo, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import { cx } from '@/components/ui/cx'
import { ageText, formatNumber, fullDateText } from '@/lib/adminTerms'
import { SCRIPT_LABELS, SCRIPT_TYPES, scriptLabel } from '@/lib/adminTrainingScreen/trainingTerms'
import { FLAG_LABELS, canApprove, canReturn } from '@/lib/adminTrainingScreen/ocrLinesQuery'
import AdminLineText from './AdminLineText'
import { lineImageSrc } from './trainingApi'

/** סוג הכתב: שני כפתורים קטנים (aria-pressed) — לחיצה קובעת ישירות (ומבטלת הצעה פתוחה), כמו קודם */
function ScriptPicker({ line, disabled, onScript }) {
  return (
    <span role="group" aria-label="סוג כתב" className="inline-flex items-center gap-1">
      <span className="text-on-surface-variant">כתב:</span>
      {SCRIPT_TYPES.map((s) => {
        const current = (line.scriptType || 'square') === s
        return (
          <button
            key={s}
            type="button"
            aria-pressed={current}
            disabled={disabled}
            onClick={() => !current && onScript(line, 'set-script', s)}
            title={current ? 'סוג הכתב הנוכחי' : `החלף ל${SCRIPT_LABELS[s]}`}
            className={cx(
              'relative rounded-(--radius-pill) px-2.5 py-0.5 text-label-md transition-colors disabled:opacity-(--button-disabled-opacity)',
              'after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[""]',
              current ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-high'
            )}
          >
            {SCRIPT_LABELS[s]}
          </button>
        )
      })}
    </span>
  )
}

/** הודעה בתוך הכרטיס (הצעת סוג כתב / דיווח של מתנדב) — טקסט ופעולות, בלי מסגרת */
function CardNotice({ tone, icon, children, actions }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-2 rounded-(--radius-control) px-3 py-2 text-body-sm',
      tone === 'error' ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-on-warning-container')}>
      <span className="flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere]"><AppIcon name={icon} className="shrink-0 text-icon-md" /><span className="min-w-0">{children}</span></span>
      {actions && <span className="flex shrink-0 gap-1">{actions}</span>}
    </div>
  )
}

/**
 * כרטיס של שורה לתמלול: תמונת השורה (ומתחתיה ספר · עמוד, המקור, סוג הכתב ו"העמוד המלא"), הטקסט שהוקלד (לעריכה),
 * הצעת המתנדב לשנות סוג כתב / דיווח של מתנדב, מי הקליד ומתי, ופעולות: "אשר" · "שלח להקלדה מחדש" · ⋮ (העמוד המלא ·
 * ── מחק לצמיתות). כמו במסך הקודם, אבל בעיצוב החדש ובשמות לפי המילון.
 * selectable — בלשונית "ממתין לאישור": תיבת בחירה לאישור מרובה.
 * onDraft(id, base, text) — כל שינוי בשדה הטקסט (base — הטקסט השמור שממנו התחילה העריכה), כדי שהמסך ישמור עריכה
 * שלא נשמרה לפני אישור. כשיש עריכה כזו, "אשר" נקרא "שמור ואשר".
 */
function OcrLineCard({ line, selectable, selected, busy, locked, onSelect, onApprove, onReturn, onDelete, onUnflag, onScript, onSetText, onDraft, onContext }) {
  const name = line.bookName ? `${line.bookName}, עמוד ${formatNumber(line.pageNumber)}` : 'שורה'
  const off = busy || locked
  const suggestionId = useId()
  // עריכה שלא נשמרה — נגזר מהטקסט השמור: כשהוא מתעדכן (נשמר), העריכה מתאפסת
  const saved = line.text || ''
  const [draft, setDraft] = useState({ base: saved, text: saved })
  if (draft.base !== saved) setDraft({ base: saved, text: saved })
  const dirty = draft.text !== saved
  const onTextChange = (text) => {
    setDraft({ base: saved, text })
    onDraft?.(line.id, saved, text)
  }
  const menuItems = useMemo(() => [
    { id: 'context', icon: 'pageview', label: 'הצג את העמוד המלא', onSelect: () => onContext(line) },
    { separator: true, id: 'sep' },
    { id: 'delete', icon: 'delete_forever', label: 'מחק לצמיתות', danger: true, disabled: off, onSelect: () => onDelete(line) },
  ], [line, off, onContext, onDelete])
  const when = ageText(line.transcribedAt)
  return (
    <li data-line-row={line.id} tabIndex={-1} aria-busy={busy || undefined}
      className={cx('flex min-w-0 flex-col gap-4 rounded-(--radius-card) bg-surface p-4 outline-none [overflow-wrap:anywhere] transition-colors focus-visible:ring-2 focus-visible:ring-primary md:flex-row',
        selected && 'bg-surface-selected', busy && 'opacity-60')}>
      {selectable && (
        <div className="-m-2 shrink-0 self-start">
          <Checkbox label={`בחר את ${name}`} checked={selected} disabled={off || !canApprove(line)} onChange={(checked) => onSelect([line.id], checked)} />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-2 md:w-1/2">
        <div className="flex min-h-14 items-center justify-center rounded-(--radius-control) bg-surface-container-low p-2">
          <img src={lineImageSrc(line.id)} alt={`תמונת השורה — ${name}`} loading="lazy" decoding="async" draggable={false} className="max-h-20 w-full object-contain" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-on-surface-variant">
          {line.bookName && <span className="min-w-0 break-words">{name}</span>}
          {line.batch && <Badge tone="neutral" className="max-w-full truncate"><span title="שורה מההגהה — המודלים לא הסכימו עליה">מההגהה · {line.batch}</span></Badge>}
          <ScriptPicker line={line} disabled={off} onScript={onScript} />
          <Button variant="text" size="sm" icon="pageview" onClick={() => onContext(line)} className="max-md:hidden">העמוד המלא</Button>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 md:w-1/2">
        {line.suggestedScriptType && (
          <CardNotice icon="swap_horiz" actions={(
            <>
              <Button variant="tonal" size="sm" disabled={off} onClick={() => onScript(line, 'accept-script')}>קבל</Button>
              <Button variant="text" size="sm" disabled={off} onClick={() => onScript(line, 'reject-script')}>דחה</Button>
            </>
          )}>
            <span id={suggestionId}>המתנדב מציע לשנות את סוג הכתב מ{scriptLabel(line.scriptType)} ל{scriptLabel(line.suggestedScriptType)}. החלט על ההצעה לפני האישור.</span>
          </CardNotice>
        )}
        {line.flagged && (
          <CardNotice tone="error" icon="flag" actions={(
            <Button variant="text" size="sm" disabled={off} onClick={() => onUnflag(line)} title="השורה חוזרת למתנדבים">הדיווח שגוי — החזר לתמלול</Button>
          )}>
            <span>דווח: {FLAG_LABELS[line.flagged] || line.flagged}{line.flaggedByName && <span className="opacity-80"> · {line.flaggedByName}</span>}</span>
          </CardNotice>
        )}
        {line.status === 'available' ? (
          <div className="flex-1 rounded-(--radius-control) bg-surface-container-low px-3 py-2 text-body-md text-on-surface-variant">
            {line.flagged ? 'מתנדבים לא יקבלו את השורה עד שתחליט' : 'עוד לא הוקלדה'}
            {!!line.prefill && <div className="mt-1" dir="rtl">טיוטת המודל: {line.prefill}</div>}
          </div>
        ) : (
          <>
            {!!line.prefill && line.prefill !== line.text && (
              <p className="rounded-(--radius-control) bg-surface-container-low px-3 py-1.5 text-body-sm text-on-surface-variant" dir="rtl">
                <span className="text-label-md">טיוטת המודל:</span> {line.prefill}
              </p>
            )}
            <AdminLineText line={line} onSave={onSetText} onTextChange={onTextChange} label={`הטקסט של ${name}`} disabled={locked} />
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-body-sm text-on-surface-variant">
            {line.transcribedByName && (
              <>
                <AppIcon name="person" className="shrink-0 text-icon-md" />
                <span className="min-w-0 truncate text-on-surface">{line.transcribedByName}</span>
                {when && <time dateTime={new Date(line.transcribedAt).toISOString()} title={fullDateText(line.transcribedAt)} suppressHydrationWarning>· {when}</time>}
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {line.status === 'submitted' && (
              <Button variant="tonal" size="sm" icon="check" softDisabled={off || !canApprove(line)} onClick={() => onApprove(line)} aria-keyshortcuts="A"
                aria-describedby={line.suggestedScriptType ? suggestionId : undefined}>
                {dirty ? 'שמור ואשר' : 'אשר'}
              </Button>
            )}
            {canReturn(line) && (
              <Button variant="text" size="sm" icon="undo" softDisabled={off} onClick={() => onReturn(line)} aria-keyshortcuts="R">שלח להקלדה מחדש</Button>
            )}
            <MenuButton label={`עוד פעולות: ${name}`} items={menuItems} />
          </div>
        </div>
      </div>
    </li>
  )
}

export default memo(OcrLineCard)

'use client'

import { memo, useEffect, useRef } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import Notice from '@/components/ui/Notice'
import { cx } from '@/components/ui/cx'
import { UNDO_SHORTCUT } from '@/components/ui/Toast'
import RelativeTime from '@/components/ui/RelativeTime'
import { hasNoChange, isUnchangedField } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import {
  LEGACY_PENDING_LINE, deleteLabel, fieldLabel, formatValue, isEmptyValue, publishLabel,
} from '@/lib/adminBookInfoScreen/bookInfoTerms'
import PullRequestLink from './PullRequestLink'

/** שדה אחד: מה בקובץ ומה מוצע. ריק — "אין" במילים (בלי קו חוצה); שדה ששווה לקובץ — "ללא שינוי" */
function FieldValues({ row, field }) {
  const before = row.approved?.[field]
  const after = row.changes?.[field]
  if (isUnchangedField(row, field)) {
    return (
      <>
        <span className="text-on-surface-variant [overflow-wrap:anywhere]">{formatValue(after)}</span>
        <Badge tone="neutral">ללא שינוי</Badge>
      </>
    )
  }
  return (
    <>
      {isEmptyValue(before)
        ? <span className="text-on-surface-variant">אין בקובץ</span>
        : <span className="text-on-surface-variant line-through decoration-on-surface-variant/50 [overflow-wrap:anywhere]"><span className="sr-only">בקובץ: </span>{formatValue(before)}</span>}
      <AppIcon name="chevron_left" className="text-icon-sm text-on-surface-variant" />
      <span className="text-on-surface [overflow-wrap:anywhere]"><span className="sr-only">מוצע: </span>{formatValue(after)}</span>
    </>
  )
}

/**
 * הצעה מהתור הישן: "בחר" (מסמן את כל השדות), שם הספר, מי הציע ומתי, והשדות — לכל שדה תיבה ("לכלול את השדה"),
 * הערך שבקובץ והערך המוצע. כשיש שדה מסומן — הכרטיס "נבחר" (רקע). למטה: "פתח בקשת מיזוג" (עם השדות המסומנים),
 * ו-⋮ "מחק" (באדום) — ששמו אומר בדיוק מה יימחק (deleteLabel) — עם "בטל" לכמה שניות.
 * הצעה בלי שום שינוי מול הקובץ — מסומנת, ובמקום "פתח בקשת מיזוג" — "מחק את ההצעה".
 * quiet — יש בחירה במסך: הכפתור בכרטיס שקט, כדי שהסרגל יהיה הפעולה הבולטת.
 * published — בקשות שנפתחו מההצעה במסך. deleting — המחיקה ממתינה ל"בטל". done — ההצעה כולה טופלה: הכרטיס
 * נשאר במקומו עם סימון שקט, עד הרענון.
 *
 * @param {{ row: any, fields: string[], onSelect: (ids: string[], checked: boolean) => void,
 *   onToggleField: (id: string, field: string, checked: boolean) => void, quiet?: boolean, busy: boolean, locked: boolean, deleting: boolean,
 *   error?: string | null, published: { prUrl?: string, prNumber?: number }[], done?: 'published' | 'deleted' | null,
 *   onPublish: (row: any) => void, onDelete: (row: any) => void, onCancelDelete: (row: any) => void }} props
 */
function LegacyCard({ row, fields, onSelect, onToggleField, quiet = false, busy, locked, deleting, error, published, done = null, onPublish, onDelete, onCancelDelete }) {
  const cardRef = useRef(null)
  const name = row.approved?.bookName || 'ספר בלי שם'
  const titleId = `legacy-${row.id}-title`
  const total = row.changedFields.length
  const count = fields.length
  const selected = count > 0 && !done
  const noChange = hasNoChange(row)
  const inactive = busy || locked || deleting || Boolean(done)

  // "מחק" ⇄ "בטל": הפוקוס עובר לכפתור שבא במקום (רק כשהיה בכרטיס, או אבד)
  const state = deleting ? 'deleting' : done || 'idle'
  const lastState = useRef(state)
  useEffect(() => {
    if (lastState.current === state) return
    lastState.current = state
    const card = cardRef.current
    const active = document.activeElement
    if (!card || (active && active !== document.body && !card.contains(active))) return
    const target = state === 'deleting' ? card.querySelector('[data-cancel]') : state === 'idle' ? card.querySelector('[data-primary]') : card
    target?.focus({ preventScroll: true })
  }, [state])

  const menuItems = [
    { id: 'delete', icon: 'delete', danger: true, disabled: inactive, label: deleteLabel(count, total), onSelect: () => onDelete(row) },
  ]

  return (
    <Card
      as="li"
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      className={cx('flex min-w-0 flex-col gap-3 p-3 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:p-4', selected && '[--card-bg:var(--color-surface-selected)]')}
    >
      <div className="flex items-start gap-1">
        <Checkbox
          label={`בחר את ההצעה ל${name} (כל השדות)`}
          checked={count === total && selected}
          indeterminate={selected && count < total}
          disabled={inactive}
          onChange={(checked) => onSelect([row.id], checked)}
          className="-ms-1.5 -mt-1.5 sm:-ms-2"
        />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className={cx('text-title-md [overflow-wrap:anywhere]', done ? 'text-on-surface-variant' : 'text-on-surface')}>{name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-body-sm text-on-surface-variant">
            <bdi className="min-w-0 [overflow-wrap:anywhere]">{row.submittedBy || 'משתמש'}</bdi>
            {row.updatedAt && <><span aria-hidden="true">·</span><RelativeTime date={row.updatedAt} prefix="הציע" /></>}
          </p>
        </div>
        {!done && <MenuButton label={`פעולות נוספות: ההצעה ל${name}`} items={menuItems} />}
      </div>

      {published.length > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface">
          <AppIcon name="check_circle" className="text-icon-md text-primary" />
          {published.length === 1 ? 'נפתחה בקשת מיזוג' : `נפתחו ${published.length} בקשות מיזוג`}
          {published.map((p, i) => <PullRequestLink key={p.prUrl || i} url={p.prUrl} number={p.prNumber} />)}
        </p>
      )}
      {done === 'deleted' && (
        <p role="status" className="flex items-center gap-2 text-body-sm text-on-surface-variant"><AppIcon name="check" className="text-icon-md" />ההצעה נמחקה</p>
      )}

      {!done && (
        <>
          {noChange && <p className="text-body-sm text-on-surface-variant">אין בהצעה הזו שינוי מול הקובץ — אפשר רק למחוק אותה.</p>}
          <div className={cx('flex flex-col rounded-(--radius-control) bg-surface-container-low transition-opacity', deleting && 'opacity-50')}>
            <p id={`${titleId}-fields`} className="px-3 pt-2 text-label-md text-on-surface-variant">סמן את השדות שהפעולה תחול עליהם</p>
            <ul aria-labelledby={`${titleId}-fields`} className="flex flex-col divide-y divide-outline-variant/60">
              {row.changedFields.map((field) => (
                <li key={field} className="grid grid-cols-[var(--touch-target)_minmax(0,1fr)] items-center gap-x-1 pe-3 sm:grid-cols-[var(--touch-target)_9rem_minmax(0,1fr)]">
                  <Checkbox
                    label={`לכלול את "${fieldLabel(field)}"`}
                    checked={fields.includes(field)}
                    disabled={inactive}
                    onChange={(checked) => onToggleField(row.id, field, checked)}
                  />
                  <span className="py-2 text-label-lg text-on-surface">{fieldLabel(field)}</span>
                  <p className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 pb-2 text-body-sm sm:col-start-3 sm:py-2">
                    <FieldValues row={row} field={field} />
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {error && <Notice tone="error" title="בקשת המיזוג לא נפתחה">{error}</Notice>}

          <div className="flex min-h-(--touch-target) flex-wrap items-center justify-end gap-2">
            {deleting ? (
              <>
                <span className="text-body-sm text-on-surface-variant">{LEGACY_PENDING_LINE}</span>
                <Button data-cancel="" variant="text" size="sm" icon="undo" onClick={() => onCancelDelete(row)} aria-label={`בטל את המחיקה: ההצעה ל${name}`} aria-keyshortcuts={UNDO_SHORTCUT} title="בטל (Ctrl+Z)">
                  בטל
                </Button>
              </>
            ) : noChange ? (
              <Button data-primary="" variant="text" size="sm" icon="delete" className="text-error! hover:bg-error-container/60!" loading={busy} softDisabled={locked} onClick={() => onDelete(row)}>
                {deleteLabel(count, total)}
              </Button>
            ) : (
              <Button
                data-primary=""
                variant={quiet ? 'text' : 'tonal'}
                size="sm"
                icon="call_merge"
                loading={busy}
                softDisabled={locked || count === 0}
                title={count === 0 ? 'סמן קודם את השדות שייכללו בבקשה' : undefined}
                onClick={() => onPublish(row)}
              >
                {publishLabel(count, total)}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

export default memo(LegacyCard)

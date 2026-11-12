'use client'

import { memo, useMemo } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import MenuButton from '@/components/ui/MenuButton'
import OpenChip from '@/components/admin/list/OpenChip'
import { cx } from '@/components/ui/cx'
import { ageText, fullDateText } from '@/lib/adminTerms'
import { LAYOUT_KIND_LABELS, taskSummary } from '@/lib/adminTrainingScreen/ocrLayoutQuery'
import { layoutThumbSrc } from './trainingApi'

/**
 * כרטיס של עמוד בתיוג מבנה: תמונה מוקטנת (לחיצה פותחת את הסקירה), שם המהדורה והעמוד, הקבוצה (batch), סוגי
 * המשימות, תקציר התשובות, מי תייג ומתי, ופעולות: "פתח" (צ'יפ שקט — סקירה ועריכה) · "אשר" · "שלח לסימון מחדש" · ⋮
 * (מחק לצמיתות). data-layout-row ו-tabIndex=-1 — כדי שהפוקוס יעבור לכרטיס הבא כשכרטיס יוצא מהרשימה.
 */
function LayoutPageCard({ page, busy, onOpen, onApprove, onReturn, onDelete }) {
  const name = `${page.edition} / ${page.pageStem}`
  const menuItems = useMemo(() => [
    { id: 'open', icon: 'rate_review', label: 'פתח לסקירה ועריכה', onSelect: () => onOpen(page) },
    { separator: true, id: 'sep' },
    { id: 'delete', icon: 'delete_forever', label: 'מחק לצמיתות', danger: true, disabled: busy, onSelect: () => onDelete(page) },
  ], [page, busy, onOpen, onDelete])
  const when = ageText(page.answeredAt)
  return (
    <li data-layout-row={page.id} tabIndex={-1}
      className={cx('flex flex-col gap-4 rounded-(--radius-card) bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-row', busy && 'opacity-60')}>
      {/* התמונה פותחת את הסקירה לעכבר ולאצבע; למקלדת ולקורא המסך — "פתח" שבשורה */}
      <button
        type="button"
        onClick={() => onOpen(page)}
        aria-hidden="true"
        tabIndex={-1}
        className="flex shrink-0 items-center justify-center rounded-(--radius-control) bg-surface-container-low p-1 transition-colors hover:bg-surface-container-high sm:w-36"
      >
        <img src={layoutThumbSrc(page.id)} alt="" loading="lazy" draggable={false} className="max-h-40 w-full object-contain" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-title-sm text-on-surface">{name}</h3>
          <Badge tone="neutral">{page.batch}</Badge>
          {page.tasks.map((t, i) => <Badge key={i} tone="neutral">{LAYOUT_KIND_LABELS[t.kind] || t.kind}</Badge>)}
        </div>
        {page.status !== 'available' ? (
          <ul className="flex flex-col gap-0.5 text-body-sm text-on-surface">
            {page.tasks.map((t, i) => <li key={i}>{taskSummary(t, LAYOUT_KIND_LABELS)}</li>)}
          </ul>
        ) : (
          <p className="rounded-(--radius-control) bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">עוד לא תויג</p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-body-sm text-on-surface-variant">
            {page.answeredByName && (
              <>
                <AppIcon name="person" className="shrink-0 text-icon-md" />
                <span className="min-w-0 truncate text-on-surface">{page.answeredByName}</span>
                {when && <time dateTime={new Date(page.answeredAt).toISOString()} title={fullDateText(page.answeredAt)} suppressHydrationWarning>· {when}</time>}
              </>
            )}
          </p>
          {/* בטלפון השורה נשברת (לא יוצאת מהכרטיס): הפעולות יורדות לשורה הבאה, מיושרות לקצה */}
          <div className="ms-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1">
            <OpenChip onClick={() => onOpen(page)} label={`פתח את ${name}`} className="me-1" />
            {page.status === 'submitted' && <Button variant="tonal" size="sm" icon="check" softDisabled={busy} onClick={() => onApprove(page)}>אשר</Button>}
            {page.status !== 'available' && <Button variant="text" size="sm" icon="undo" softDisabled={busy} onClick={() => onReturn(page)}>שלח לסימון מחדש</Button>}
            <MenuButton label={`עוד פעולות: ${name}`} items={menuItems} />
          </div>
        </div>
      </div>
    </li>
  )
}

export default memo(LayoutPageCard)

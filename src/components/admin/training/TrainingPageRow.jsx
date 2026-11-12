'use client'

import { memo, useMemo } from 'react'
import Link from 'next/link'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { ageText, formatNumber, fullDateText } from '@/lib/adminTerms'
import { scriptLabel, statusLabel, statusTone } from '@/lib/adminTrainingScreen/trainingTerms'
import { linesDone, linesProgressText, workerOf } from '@/lib/adminTrainingScreen/trainingPagesQuery'
import { trainingPageHref } from './trainingApi'
import {
  AREA_ADDED, AREA_CHECK, AREA_LINES, AREA_MAIN, AREA_MENU, AREA_NUMBER, AREA_OPEN, AREA_SCRIPT, AREA_STATUS, AREA_SUB, AREA_USER, BOOK_NAME,
  ROW_GRID, ROW_PADDING,
} from './trainingRowLayout'

/** "פתח" — צ'יפ שקט (כמו OpenChip), כקישור לעמוד הסימון של המתנדבים */
function OpenLink({ href, label }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      className={cx(
        'relative inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-(--radius-pill) bg-surface-container py-0.5 pe-1.5 ps-2.5 text-label-md text-on-surface transition-colors hover:bg-surface-container-high',
        TOUCH_TARGET_OVERLAY,
        FOCUS_RING
      )}
    >
      פתח
      <AppIcon name="chevron_left" className="text-icon-md" />
    </Link>
  )
}

function Updated({ date }) {
  const text = ageText(date)
  if (!text) return <span aria-hidden="true">—</span>
  return <time dateTime={new Date(date).toISOString()} title={fullDateText(date)} suppressHydrationWarning>{text}</time>
}

/**
 * שורה של עמוד לאימון: בחירה, ספר, עמוד, סוג כתב (תג ניטרלי — מאפיין, לא מצב), מצב, כמה שורות עם טקסט מתוך היעד,
 * המתנדב ("בעבודה אצל" / "הושלם בידי"), מתי עודכן (כמו במסך הקודם), "פתח" (עמוד הסימון) ו-⋮: שחרר (רק כשמישהו עובד
 * עליו או שהושלם) · ── מחק לצמיתות. tabIndex=-1 — יעד לפוקוס כששורה שלידה נמחקת.
 * @param {{ page: any, selected: boolean, busy: boolean, locked: boolean, onSelect: (ids: string[], checked: boolean) => void,
 *   onRelease: (page: any) => void, onDelete: (page: any) => void }} props
 */
function TrainingPageRow({ page, selected, busy, locked, onSelect, onRelease, onDelete }) {
  const name = `${page.bookName}, עמוד ${page.pageNumber}`
  const done = linesDone(page)
  const worker = workerOf(page)
  const menuItems = useMemo(() => {
    const items = []
    if (page.status !== 'available') items.push({ id: 'release', icon: 'lock_open', label: 'שחרר', disabled: busy || locked, onSelect: () => onRelease(page) })
    if (items.length) items.push({ separator: true, id: 'sep' })
    items.push({ id: 'delete', icon: 'delete_forever', label: 'מחק לצמיתות', danger: true, disabled: busy || locked, onSelect: () => onDelete(page) })
    return items
  }, [page, busy, locked, onRelease, onDelete])
  const lines = (
    <span className={done ? 'text-success' : undefined}>
      {linesProgressText(page)} <span className="@4xl:sr-only">שורות</span>
    </span>
  )
  return (
    <li data-row={page.id} tabIndex={-1}
      className={cx(ROW_GRID, ROW_PADDING, 'relative outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary', selected && 'bg-surface-selected', busy && 'opacity-60')}>
      <div className={AREA_CHECK}>
        <Checkbox label={`בחר את ${name}`} checked={selected} disabled={locked || busy} onChange={(checked) => onSelect([page.id], checked)} />
      </div>
      <div className={AREA_MAIN}>
        <h3 title={page.bookName} className={BOOK_NAME}>
          {page.bookName}
          <span className="whitespace-nowrap text-body-md font-normal text-on-surface-variant @4xl:sr-only">, עמוד {formatNumber(page.pageNumber)}</span>
        </h3>
      </div>
      <div className={AREA_SUB}>
        <Badge tone="neutral">{scriptLabel(page.scriptType)}</Badge>
        <Badge tone={statusTone(page.status)}>{statusLabel(page.status)}</Badge>
        {lines}
        {worker && <span title={worker.name} className="min-w-0 basis-full truncate">{worker.label} {worker.name}</span>}
      </div>
      <p aria-hidden="true" className={AREA_NUMBER}>{formatNumber(page.pageNumber)}</p>
      <div className={AREA_SCRIPT}><Badge tone="neutral">{scriptLabel(page.scriptType)}</Badge></div>
      <div className={AREA_STATUS}><Badge tone={statusTone(page.status)}>{statusLabel(page.status)}</Badge></div>
      <p className={AREA_LINES} title={page.markedLines > page.filledLines ? `${formatNumber(page.markedLines)} שורות מסומנות` : undefined}>
        <span className="sr-only">שורות עם טקסט: </span>{lines}
      </p>
      <p className={AREA_USER} title={worker ? `${worker.label} ${worker.name}` : undefined}>
        {worker ? <><span className="sr-only">{worker.label}: </span>{worker.name}</> : <span aria-hidden="true" className="text-on-surface-variant">—</span>}
      </p>
      <p className={AREA_ADDED}><span className="sr-only">עודכן </span><Updated date={page.updatedAt || page.createdAt} /></p>
      <div className={AREA_OPEN}><OpenLink href={trainingPageHref(page.id)} label={`פתח את ${name}`} /></div>
      <div className={AREA_MENU}><MenuButton label={`עוד פעולות: ${name}`} items={menuItems} /></div>
    </li>
  )
}

export default memo(TrainingPageRow)

export function TrainingColumnsHeader() {
  return (
    <div aria-hidden="true" className={cx(ROW_GRID, ROW_PADDING, 'hidden min-h-11 border-b border-outline-variant/60 py-1 text-label-md text-on-surface-variant @4xl:grid')}>
      <span className="[grid-area:main]">ספר</span>
      <span className="[grid-area:number]">עמוד</span>
      <span className="[grid-area:script]">כתב</span>
      <span className="[grid-area:status]">מצב</span>
      <span className="[grid-area:lines]">שורות</span>
      <span className="[grid-area:user]">מתנדב</span>
      <span className="[grid-area:added]">עודכן</span>
    </div>
  )
}

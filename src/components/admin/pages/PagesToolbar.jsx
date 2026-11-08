'use client'

import { useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import SelectMenu from '@/components/ui/SelectMenu'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { PAGE_SORTS, SORT_LABELS } from '@/lib/adminPagesScreen/pagesQuery'
import JumpToPage from './JumpToPage'
import { CHECKING_TEXT, bulkProgressText, formatNumber, pagesCountText } from '@/lib/adminPagesScreen/pageTerms'

const SORT_OPTIONS = PAGE_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))
const SELECT_ALL_ID = 'pages-select-all'
const RELEASE_ID = 'pages-bulk-release'

/**
 * שורת הכלים מעל העמודים: בלי בחירה — "בחר הכול" (בעמוד), כמה עמודים ומיון; עם בחירה — "שחרר נבחרים" ו"הורד
 * טקסט". "בחר את כל N" — כשכל העמוד נבחר ויש עוד. בזמן ריצה — "משחרר… X מתוך Y", פס ו"עצור" (BulkProgress),
 * והבחירה נעולה; בסוף הפוקוס חוזר לשורה. releasable — כמה מהנבחרים בעבודה (את השאר אין מה לשחרר).
 * "שחרר" עם המילה גם ברשימה צרה — זו הפעולה העיקרית של המסך, ומנעול פתוח לבד לא מסביר את עצמו.
 * note — כשהשרת שלח רק חלק (מעל התקרה): שורה שקטה ליד המונה, וההסבר המלא בריחוף.
 *
 * @param {{ pageIds: string[], matchingIds: string[], selected: Set<string>, onSelect: (ids: string[], checked: boolean) => void,
 *   onSelectAll: () => void, onClear: () => void, clearedText?: string, total: number, sort: string, onSortChange: (sort: string) => void,
 *   releasable: number, working: boolean, onBulk: (action: 'release' | 'download') => void,
 *   progress?: { action: string, phase?: string, done: number, total: number, announced?: number } | null, stopping?: boolean,
 *   onStop?: () => void, note?: { text: string, title: string } | null, onJump?: (number: number) => void }} props
 * onJump — "קפוץ לעמוד" (רק כשנבחר ספר).
 */
export default function PagesToolbar({
  pageIds, matchingIds, selected, onSelect, onSelectAll, onClear, clearedText, total, sort, onSortChange, releasable, working, onBulk, progress, stopping = false, onStop, note, onJump,
}) {
  const pageSelected = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && pageSelected === pageIds.length
  const canSelectAll = allOnPage && matchingIds.length > pageIds.length && selected.size < matchingIds.length
  const count = selected.size
  const running = Boolean(progress)
  const acrossPages = count > pageSelected

  // סוף הריצה: "עצור" נעלם — הפוקוס חוזר לשורה, לא לתחילת הדף
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      const active = document.activeElement
      if (!active || active === document.body) (document.getElementById(RELEASE_ID) || document.getElementById(SELECT_ALL_ID))?.focus()
    }
    wasRunning.current = running
  }, [running])

  const releaseLabel = releasable === 0
    ? 'שחרר — אין בנבחרים עמוד בעבודה'
    : releasable === count && !acrossPages ? 'שחרר את הנבחרים' : `שחרר ${pagesCountText(releasable)}`
  // המספר — רק כשהוא שונה מהנבחרים שבעמוד (ולא "שחרר 0")
  const releaseText = releasable > 0 && (acrossPages || releasable < count) ? `שחרר ${formatNumber(releasable)}` : 'שחרר נבחרים'
  const checking = progress?.phase === 'check'

  return (
    <BulkActionBar
      count={count}
      countText={count === 1 ? 'עמוד אחד נבחר' : `${formatNumber(count)} נבחרו${acrossPages ? ' (בכל העמודים)' : ''}`}
      clearedText={clearedText}
      label="פעולות על העמודים שנבחרו"
      locked={running}
      selectAll={(
        <Checkbox
          id={SELECT_ALL_ID}
          label={allOnPage ? 'בטל את הבחירה בעמוד' : 'בחר את כל העמודים בעמוד הזה'}
          checked={allOnPage}
          indeterminate={pageSelected > 0 && !allOnPage}
          disabled={pageIds.length === 0 || running}
          onChange={(checked) => onSelect(pageIds, checked)}
        />
      )}
      idle={(
        <>
          <p className="flex-1 basis-auto text-body-sm tabular-nums text-on-surface-variant">
            <span className="whitespace-nowrap">{pagesCountText(total)}</span>
            {note && <span title={note.title} className="ms-2 inline-flex items-center gap-1 align-middle"><span aria-hidden="true">·</span> {note.text}<span className="sr-only">. {note.title}</span></span>}
          </p>
          {onJump && <JumpToPage onJump={onJump} />}
          <SelectMenu variant="quiet" label="מיון" hideLabel options={SORT_OPTIONS} value={sort} onChange={onSortChange} searchable={false} />
        </>
      )}
      actions={progress ? (
        <BulkProgress
          text={checking ? CHECKING_TEXT : bulkProgressText(progress.action, progress)}
          announce={checking ? CHECKING_TEXT : bulkProgressText(progress.action, { done: progress.announced ?? progress.done, total: progress.total })}
          value={checking ? 0 : progress.done}
          max={progress.total}
          onStop={onStop}
          stopping={stopping}
          focusStop
        />
      ) : (
        <>
          <Button id={RELEASE_ID} className={ACTION_BUTTON} variant="text" size="sm" icon="lock_open" softDisabled={working || releasable === 0}
            title={releasable === 0 ? 'אין בנבחרים עמוד בעבודה' : undefined} onClick={() => onBulk('release')} aria-label={releaseLabel}>
            {releaseText}
          </Button>
          <Button className={ACTION_BUTTON} variant="text" size="sm" icon="download" softDisabled={working} onClick={() => onBulk('download')}
            aria-label={acrossPages ? `הורד את הטקסט של ${pagesCountText(count)}` : 'הורד את הטקסט של הנבחרים'}>
            <span className={ACTION_TEXT}>הורד טקסט</span>
          </Button>
        </>
      )}
      extra={canSelectAll && !running && (
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            onSelectAll()
            requestAnimationFrame(() => document.getElementById(SELECT_ALL_ID)?.focus())
          }}
        >
          בחר את כל {formatNumber(matchingIds.length)} העמודים
        </Button>
      )}
      onClear={onClear}
    />
  )
}

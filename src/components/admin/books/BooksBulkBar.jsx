'use client'

import { useRef } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import SelectMenu from '@/components/ui/SelectMenu'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { BOOK_SORTS, SORT_LABELS } from '@/lib/adminBooks/booksQuery'
import { booksCountText, bulkProgressText, formatNumber, selectedBooksText } from '@/lib/adminBooks/bookTerms'

const SORT_OPTIONS = BOOK_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))

/**
 * שורת הכלים של הרשימה: בלי בחירה — "בחר הכול", כמה נמצאו ומיון; עם בחירה — הפעולות המרובות שה-API
 * תומך בהן: "הסתר", "הצג", "שנה קטגוריה" ו"מזג" (משני ספרים ומעלה; בספר אחד — מושבת, והשם אומר למה).
 * אין מחיקה מרובה — בכוונה.
 * "בחר את כל N" — כשכל העמוד נבחר; אחרי הלחיצה הפוקוס עובר לתיבת "בחר הכול". כשהבחירה כוללת ספרים
 * מעמודים אחרים — המונה והכפתורים אומרים על כמה ספרים הם פועלים ("הסתר 3,000"), כדי שלא ייראה שהפעולה
 * חלה רק על העמוד שרואים.
 * progress — פעולה מרובה רצה: במקום הכפתורים — "מסתיר… 120 מתוך 2,745", פס ו"עצור".
 *
 * @param {{ pageIds: string[], matchingIds: string[], selected: Set<string>, onSelect: (ids: string[], checked: boolean) => void,
 *   onSelectAll: () => void, onClear: () => void, total: number, sort: string, onSortChange: (sort: string) => void,
 *   categoryOptions: { value: string, label: string, color?: string }[], working: boolean,
 *   onBulk: (kind: 'hide' | 'show' | 'category' | 'merge', value?: string) => void, clearedText?: string,
 *   progress?: { action: string, done: number, total: number } | null, onStop?: () => void }} props
 */
export default function BooksBulkBar({
  pageIds, matchingIds, selected, onSelect, onSelectAll, onClear, total, sort, onSortChange, categoryOptions, working, onBulk, clearedText,
  progress = null, onStop,
}) {
  const selectAllRef = useRef(null)
  const pageSelected = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && pageSelected === pageIds.length
  const canSelectAllMatching = allOnPage && matchingIds.length > pageIds.length && selected.size < matchingIds.length
  // הבחירה חוצה עמודים — הכפתורים אומרים כמה
  const acrossPages = selected.size > pageSelected
  const n = formatNumber(selected.size)
  const verb = (text) => (acrossPages ? `${text} ${n}` : text)

  const selectPage = (
    <span ref={selectAllRef} className="contents">
      <Checkbox
        label={allOnPage ? 'בטל את הבחירה בעמוד' : 'בחר את כל הספרים בעמוד'}
        checked={allOnPage}
        indeterminate={pageSelected > 0 && !allOnPage}
        disabled={pageIds.length === 0}
        onChange={(checked) => onSelect(pageIds, checked)}
      />
    </span>
  )

  const idle = (
    <>
      <p className="min-w-0 flex-1 text-body-sm text-on-surface-variant tabular-nums">{booksCountText(total)}</p>
      <SelectMenu variant="quiet" label="מיון" hideLabel options={SORT_OPTIONS} value={sort} onChange={onSortChange} searchable={false} />
    </>
  )

  const actions = progress ? (
    <BulkProgress text={bulkProgressText(progress.action, progress)} value={progress.done} max={progress.total} onStop={onStop} />
  ) : (
    <>
      <Button className={ACTION_BUTTON} variant="text" size="sm" icon="visibility_off" disabled={working} onClick={() => onBulk('hide')} aria-label={acrossPages ? `הסתר ${booksCountText(selected.size)}` : 'הסתר את הנבחרים'}>
        <span className={ACTION_TEXT}>{verb('הסתר')}</span>
      </Button>
      <Button className={ACTION_BUTTON} variant="text" size="sm" icon="visibility" disabled={working} onClick={() => onBulk('show')} aria-label={acrossPages ? `הצג ${booksCountText(selected.size)}` : 'הצג את הנבחרים'}>
        <span className={ACTION_TEXT}>{verb('הצג')}</span>
      </Button>
      <SelectMenu
        variant="action"
        label={acrossPages ? `העבר ${booksCountText(selected.size)} לקטגוריה` : 'העבר את הנבחרים לקטגוריה'}
        title="שנה קטגוריה"
        triggerText={acrossPages ? `שנה קטגוריה (${n})` : 'שנה קטגוריה'}
        textClassName={ACTION_TEXT}
        triggerClassName={ACTION_BUTTON}
        icon="category"
        options={categoryOptions}
        value={null}
        disabled={working}
        onChange={(value) => onBulk('category', value)}
      />
      <Button
        className={ACTION_BUTTON}
        variant="text"
        size="sm"
        icon="call_merge"
        disabled={working || selected.size < 2}
        onClick={() => onBulk('merge')}
        aria-label={selected.size < 2 ? 'מזג — בחר לפחות שני ספרים' : `מזג ${booksCountText(selected.size)}`}
        title={selected.size < 2 ? 'כדי למזג, בחר לפחות שני ספרים' : undefined}
      >
        <span className={ACTION_TEXT}>{selected.size < 2 ? 'מזג' : verb('מזג')}</span>
      </Button>
    </>
  )

  return (
    <BulkActionBar
      count={selected.size}
      countText={selected.size === 1 ? selectedBooksText(1) : `${n} נבחרו${acrossPages ? ' (בכל העמודים)' : ''}`}
      clearedText={clearedText}
      selectAll={selectPage}
      idle={idle}
      actions={actions}
      extra={canSelectAllMatching && (
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            onSelectAll()
            requestAnimationFrame(() => selectAllRef.current?.querySelector('input')?.focus())
          }}
        >
          בחר את כל {formatNumber(matchingIds.length)} הספרים
        </Button>
      )}
      onClear={onClear}
    />
  )
}

'use client'

import { useRef } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import SelectMenu from '@/components/ui/SelectMenu'
import BulkActionBar, { ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import { booksCountText, formatNumber, selectedText, uploadsCountText } from '@/lib/adminUploads/uploadTerms'

const SORT_OPTIONS = {
  uploads: [
    { value: 'newest', label: 'החדשים קודם' },
    { value: 'oldest', label: 'הוותיקים קודם' },
    { value: 'name', label: 'לפי שם הספר' },
  ],
  trash: [
    { value: 'newest', label: 'נמחקו לאחרונה' },
    { value: 'oldest', label: 'נמחקו מזמן' },
    { value: 'name', label: 'לפי שם הספר' },
  ],
}

// פעולה הרסנית בשורה: טקסט ואייקון בצבע השגיאה (לא כפתור מלא — זו שורת כלים)
const DANGER_TEXT = 'text-error! hover:bg-error-container/60!'

/**
 * שורת הכלים של הרשימה: בלי בחירה — "בחר הכול", כמה נמצאו ומיון (ובאשפה — "רוקן אשפה", באדום);
 * עם בחירה — הפעולות המרובות: בהעלאות "שנה מצב", "הורד" (מנהל כללי) ו"מחק" (באדום); באשפה "שחזר"
 * ו"מחק לצמיתות". המונה בספרים ("3 ספרים נבחרו · 101 העלאות").
 * "בחר את כל N" — כשכל העמוד נבחר; אחרי הלחיצה הכפתור נעלם, והפוקוס עובר לתיבת "בחר הכול".
 *
 * @param {{ tab: 'uploads' | 'trash', selectedScope: { books: number, uploads: number }, pageIds: string[],
 *   matchingIds: string[], selected: Set<string>, onSelect: (ids: string[], checked: boolean) => void,
 *   onSelectAll: () => void, onClear: () => void, groupCount: number, uploadCount: number, sort: string,
 *   onSortChange: (sort: string) => void, statusOptions: any[], permissions: { batchDownload: boolean },
 *   working: boolean, onBulk: (kind: string, value?: string) => void, trashTotal: number, onEmptyTrash: () => void,
 *   clearedText?: string }} props
 */
export default function UploadsBulkBar({
  tab, selectedScope, pageIds, matchingIds, selected, onSelect, onSelectAll, onClear,
  groupCount, uploadCount, sort, onSortChange, statusOptions, permissions, working, onBulk, trashTotal, onEmptyTrash, clearedText,
}) {
  const selectAllRef = useRef(null)
  const pageSelected = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && pageSelected === pageIds.length
  const canSelectAllMatching = allOnPage && matchingIds.length > pageIds.length && selected.size < matchingIds.length

  const selectPage = (
    <span ref={selectAllRef} className="contents">
      <Checkbox
        label={allOnPage ? 'בטל את הבחירה בעמוד' : 'בחר את כל ההעלאות בעמוד'}
        checked={allOnPage}
        indeterminate={pageSelected > 0 && !allOnPage}
        disabled={pageIds.length === 0}
        onChange={(checked) => onSelect(pageIds, checked)}
      />
    </span>
  )

  const idle = (
    <>
      <p className="min-w-0 flex-1 text-body-sm text-on-surface-variant">
        {booksCountText(groupCount)} <span aria-hidden="true">·</span> {uploadsCountText(uploadCount)}
      </p>
      <div className="flex items-center gap-1">
        <SelectMenu variant="quiet" label="מיון" hideLabel options={SORT_OPTIONS[tab]} value={sort} onChange={onSortChange} searchable={false} />
        {tab === 'trash' && trashTotal > 0 && (
          <Button variant="text" size="sm" icon="delete_forever" onClick={onEmptyTrash} className={DANGER_TEXT}>רוקן אשפה</Button>
        )}
      </div>
    </>
  )

  const actions = tab === 'trash' ? (
    <>
      <Button variant="text" size="sm" icon="restore" disabled={working} onClick={() => onBulk('restore')} aria-label="שחזר את הנבחרים">
        <span className={ACTION_TEXT}>שחזר</span>
      </Button>
      <Button variant="text" size="sm" icon="delete_forever" disabled={working} onClick={() => onBulk('deleteForever')} aria-label="מחק לצמיתות את הנבחרים" className={DANGER_TEXT}>
        <span className={ACTION_TEXT}>מחק לצמיתות</span>
      </Button>
    </>
  ) : (
    <>
      <SelectMenu
        variant="action"
        label="שנה את המצב של הנבחרים"
        title="שנה מצב"
        triggerText="שנה מצב"
        textClassName={ACTION_TEXT}
        icon="label"
        options={statusOptions}
        value={null}
        searchable={false}
        disabled={working}
        onChange={(value) => onBulk('status', value)}
      />
      {permissions.batchDownload && (
        <Button variant="text" size="sm" icon="download" disabled={working} onClick={() => onBulk('download')} aria-label="הורד את הנבחרים">
          <span className={ACTION_TEXT}>הורד</span>
        </Button>
      )}
      <Button variant="text" size="sm" icon="delete" disabled={working} onClick={() => onBulk('trash')} aria-label="מחק את הנבחרים" className={DANGER_TEXT}>
        <span className={ACTION_TEXT}>מחק</span>
      </Button>
    </>
  )

  return (
    <BulkActionBar
      count={selected.size}
      countText={selectedText(selectedScope)}
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
            // הכפתור נעלם אחרי הלחיצה — הפוקוס לתיבת "בחר הכול", ולא ל-body
            requestAnimationFrame(() => selectAllRef.current?.querySelector('input')?.focus())
          }}
        >
          בחר את כל {formatNumber(matchingIds.length)} ההעלאות
        </Button>
      )}
      onClear={onClear}
    />
  )
}

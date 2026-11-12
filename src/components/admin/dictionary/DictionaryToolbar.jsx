'use client'

import { useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import SelectMenu from '@/components/ui/SelectMenu'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { DICTIONARY_SORTS, SORT_LABELS } from '@/lib/adminDictionaryScreen/dictionaryQuery'
import { bulkProgressText, wordsCountText } from '@/lib/adminDictionaryScreen/dictionaryTerms'

const SORT_OPTIONS = DICTIONARY_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))
const SELECT_ALL_ID = 'dictionary-select-all'

/**
 * שורת הכלים מעל המילים: בלי בחירה — "בחר הכול" (בעמוד), כמה מילים ומיון; עם בחירה — "אשר" ו"דלג" (בלשונית
 * "דולגו" — רק "אשר"). בזמן ריצה — "X מתוך Y", פס ו"עצור", והבחירה נעולה; בסוף הפוקוס חוזר ל"בחר הכול".
 *
 * @param {{ pageWords: string[], selected: Set<string>, onSelect: (words: string[], checked: boolean) => void,
 *   onClear: () => void, clearedText?: string, total: number, view: string, sort: string, onSortChange: (sort: string) => void,
 *   working: boolean, onBulk: (action: 'approve' | 'skip') => void, progress?: { action: string, done: number, total: number } | null,
 *   stopping?: boolean, onStop: () => void }} props
 */
export default function DictionaryToolbar({
  pageWords, selected, onSelect, onClear, clearedText, total, view, sort, onSortChange, working, onBulk, progress, stopping = false, onStop,
}) {
  const pageSelected = pageWords.filter((w) => selected.has(w)).length
  const allOnPage = pageWords.length > 0 && pageSelected === pageWords.length
  const count = selected.size
  const running = Boolean(progress)

  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      const active = document.activeElement
      if (!active || active === document.body) document.getElementById(SELECT_ALL_ID)?.focus()
    }
    wasRunning.current = running
  }, [running])

  return (
    <BulkActionBar
      count={count}
      countText={count === 1 ? 'מילה אחת נבחרה' : `${wordsCountText(count)} נבחרו`}
      clearedText={clearedText}
      label="פעולות על המילים שנבחרו"
      locked={running}
      selectAll={(
        <Checkbox
          id={SELECT_ALL_ID}
          label={allOnPage ? 'בטל את הבחירה בעמוד' : 'בחר את כל המילים בעמוד הזה'}
          checked={allOnPage}
          indeterminate={pageSelected > 0 && !allOnPage}
          disabled={pageWords.length === 0 || running}
          onChange={(checked) => onSelect(pageWords, checked)}
        />
      )}
      idle={(
        <>
          <p className="flex-1 text-body-sm tabular-nums text-on-surface-variant">{wordsCountText(total)}</p>
          <SelectMenu variant="quiet" label="מיון" hideLabel options={SORT_OPTIONS} value={sort} onChange={onSortChange} searchable={false} />
        </>
      )}
      actions={progress ? (
        <BulkProgress text={bulkProgressText(progress.action, progress)} value={progress.done} max={progress.total} onStop={onStop} stopping={stopping} focusStop />
      ) : (
        <>
          <Button className={ACTION_BUTTON} variant="text" size="sm" icon="check" softDisabled={working} onClick={() => onBulk('approve')}
            aria-label="אשר את הנבחרות — הוסף למילון הכללי">
            אשר
          </Button>
          {view === 'pending' && (
            <Button className={ACTION_BUTTON} variant="text" size="sm" icon="redo" softDisabled={working} onClick={() => onBulk('skip')}
              aria-label="דלג על הנבחרות">
              <span className={ACTION_TEXT}>דלג</span>
            </Button>
          )}
        </>
      )}
      onClear={onClear}
    />
  )
}

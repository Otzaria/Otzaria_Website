'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import ListPager from '@/components/admin/list/ListPager'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { loginHref } from '@/components/admin/list/adminRequest'
import { useListData } from '@/components/admin/list/useListData'
import WorkspaceLink from '@/components/admin/dictaEdit/WorkspaceLink'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import {
  activeFilterCount, clearFilters, filterOptions, filterSuggestions, filterSummary, paginate, sanitizeSuggestionsQuery, serializeSuggestionsQuery,
  updateSuggestionsQuery,
} from '@/lib/adminSuggestions/suggestionsQuery'
import { lockedNotice } from '@/lib/adminSuggestions/suggestionTerms'
import BlockUserDialog from './BlockUserDialog'
import SuggestionCard from './SuggestionCard'
import SuggestionsFilterBar from './SuggestionsFilterBar'
import { SuggestionsFilterSkeleton, SuggestionsListSkeleton } from './SuggestionsSkeleton'
import SuggestionsToolbar from './SuggestionsToolbar'
import { listSuggestions } from './suggestionsApi'
import { SUGGESTIONS_DESCRIPTION, SUGGESTIONS_TITLE } from './suggestionsScreenText'
import { SUGGESTIONS_LIST_ID, useSuggestionActions } from './useSuggestionActions'
import { useSuggestionsQuery } from './useSuggestionsQuery'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'

const TITLE_ID = 'suggestions-title'

/**
 * "הצעות עריכה" (/library/dicta-edit/moderation), בתוך מעטפת הניהול. אותן בקשות לשרת כמו המסך הקודם.
 * סינון (ספר · מציע · סוג), מיון ועמוד — בכתובת. רשימת כרטיסים (לא טבלה), 20 בעמוד. בחירה — בעמוד המוצג,
 * ומתאפסת כשהסינון או העמוד משתנים. בזמן פעולה מרובה הסינון, העמוד והבחירה נעולים — כך "X מתוך Y" ו"עצור"
 * לא נעלמים באמצע, והכרטיסים שבריצה נשארים מול העיניים. ההודעות הקופצות (useToast) מגיעות מהמעטפת.
 */
export default function SuggestionsScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [rawQuery, setQuery] = useSuggestionsQuery()
  const data = useListData(listSuggestions, {
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const ready = data.status === 'ready'
  const edits = data.items
  const query = useMemo(() => (ready ? sanitizeSuggestionsQuery(rawQuery, edits) : rawQuery), [ready, rawQuery, edits])
  const { actions, busy, rejecting, notices, bulkProgress, stopBulk, locked } = useSuggestionActions({ data, toast, confirm })
  const [blockTarget, setBlockTarget] = useState(null)
  const running = bulkProgress !== null

  // פעולה מרובה באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר אותה. דחייה שעוד לא יצאה — רק אזהרת
  // הדפדפן ברענון / סגירה (מעבר בתוך האתר שולח אותה מיד)
  useBulkLeaveGuard({
    running,
    pending: rejecting.size > 0,
    stop: stopBulk,
    confirm,
    body: 'הפעולה על ההצעות שנבחרו עוד רצה. מה שכבר נשלח נשאר; מה שעוד לא נשלח — לא יישלח.',
  })

  // ערך שנזרק (ספר שכל ההצעות שלו טופלו, עמוד שכבר לא קיים) — הכתובת מתוקנת למה שמוצג
  const filtered = useMemo(() => filterSuggestions(edits, query), [edits, query])
  const page = paginate(filtered, query.page)
  useEffect(() => {
    if (!ready) return
    const fixed = { ...query, page: page.page }
    if (serializeSuggestionsQuery(fixed) !== serializeSuggestionsQuery(rawQuery)) setQuery(fixed)
  }, [ready, query, rawQuery, page.page, setQuery])

  const options = useMemo(() => filterOptions(edits), [edits])
  const changeQuery = useCallback((patch) => { if (!running) setQuery(updateSuggestionsQuery(query, patch)) }, [query, setQuery, running])
  const clearAll = useCallback(() => { if (!running) setQuery(clearFilters(query)) }, [query, setQuery, running])
  const goToPage = useCallback((n) => {
    if (running) return
    setQuery(updateSuggestionsQuery(query, { page: n }), { push: true })
    document.getElementById(SUGGESTIONS_LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery, running])

  // ----- בחירה: מתאפסת כשהסינון או העמוד משתנים (נגזר, בלי effect) -----
  const queryKey = JSON.stringify([query.book, query.author, query.kind, query.sort, page.page])
  const { ids: selectedIds, clearedText, select, clear: clearSelection, keep: keepSelection } = useKeyedSelection(queryKey, { locked: running })
  const pageIds = page.items.filter((e) => !rejecting.has(e._id)).map((e) => e._id)
  const shown = useMemo(() => new Set(filtered.map((e) => e._id)), [filtered])
  const selected = useMemo(() => new Set([...selectedIds].filter((id) => shown.has(id) && !rejecting.has(id))), [selectedIds, shown, rejecting])

  const [bulkWorking, setBulkWorking] = useState(false)
  const onBulk = useCallback(async (action) => {
    if (bulkWorking || locked) return
    const list = filtered.filter((e) => selected.has(e._id))
    if (list.length === 0) return
    setBulkWorking(true)
    try {
      // מי שלא עודכן (או לא נשלח בגלל "עצור") נשאר מסומן, לניסיון נוסף
      const keep = await actions.bulk(action, list)
      keepSelection(keep)
    } finally {
      setBulkWorking(false)
    }
  }, [filtered, selected, actions, bulkWorking, locked, keepSelection])

  const onBlock = useCallback((edit) => setBlockTarget({ id: edit.author, name: edit.authorName }), [])

  const refreshAll = async () => {
    if (await data.refresh()) toast.show({ message: 'הרשימה עודכנה' })
  }
  const filters = activeFilterCount(query)
  const empty = !ready ? null : edits.length === 0 ? 'all' : filtered.length === 0 ? 'filtered' : null
  const lockText = locked ? lockedNotice(locked) : null

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={SUGGESTIONS_TITLE}
        description={SUGGESTIONS_DESCRIPTION}
        action={<WorkspaceLink />}
        menuItems={[{ id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll }]}
      />

      {data.status === 'loading' && (
        <div aria-busy="true" className="flex flex-col gap-5">
          <p role="status" className="sr-only">טוען את הצעות העריכה…</p>
          <SuggestionsFilterSkeleton />
          <SuggestionsListSkeleton />
        </div>
      )}
      {data.status === 'error' && (
        <LoadError
          error={data.error}
          title="לא הצלחנו לטעון את הצעות העריכה"
          sessionText="התחבר מחדש כדי לראות את ההצעות. אחרי ההתחברות תחזור לכאן."
          onRetry={data.retry}
        />
      )}

      {ready && lockText && (
        <Notice
          tone="error"
          role="alert"
          title={lockText.title}
          action={locked?.sessionExpired ? <Button href={loginHref()} variant="filled" size="sm" icon="login">התחבר</Button> : undefined}
        >
          {lockText.body}
        </Notice>
      )}

      {ready && empty !== 'all' && (
        <SuggestionsFilterBar query={query} options={options} onChange={changeQuery} onClear={clearAll} count={filters} hideClear={empty === 'filtered'} disabled={running} />
      )}

      {ready && (
        <section id={SUGGESTIONS_LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} className="flex min-w-0 flex-col gap-3 outline-none">
          {empty === 'all' && (
            <EmptyState icon="task_alt" title="אין הצעות שממתינות" description="כשמשתמש יציע שינוי בטקסט של ספר, ההצעה תופיע כאן." />
          )}
          {empty === 'filtered' && (
            <EmptyState
              role="status"
              icon="search_off"
              title="אין הצעות שמתאימות לסינון"
              description={`הסינון: ${filterSummary(query, options).join(' · ')}`}
              actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={clearAll}>נקה סינון</Button>}
            />
          )}
          {!empty && (
            <>
              <SuggestionsToolbar
                pageIds={pageIds}
                selected={selected}
                onSelect={select}
                onClear={clearSelection}
                clearedText={clearedText}
                total={filtered.length}
                sort={query.sort}
                onSortChange={(sort) => changeQuery({ sort })}
                working={bulkWorking}
                disabled={Boolean(locked)}
                onBulk={onBulk}
                progress={bulkProgress}
                onStop={stopBulk}
              />
              <ul aria-label="ההצעות שממתינות" className="flex flex-col gap-3">
                {page.items.map((edit) => (
                  <SuggestionCard
                    key={edit._id}
                    edit={edit}
                    selected={selected.has(edit._id)}
                    onSelect={select}
                    busy={busy.has(edit._id)}
                    rejecting={rejecting.has(edit._id)}
                    locked={running || Boolean(locked)}
                    notice={notices.get(edit._id) || null}
                    actions={actions}
                    onBlock={onBlock}
                  />
                ))}
              </ul>
              <ListPager page={page} onChange={goToPage} disabled={running} />
            </>
          )}
        </section>
      )}

      {confirmElement}
      {blockTarget && (
        <BlockUserDialog
          target={blockTarget}
          onClose={() => setBlockTarget(null)}
          onDone={(message) => {
            setBlockTarget(null)
            toast.show({ message })
            data.refresh()
          }}
        />
      )}
    </div>
  )
}

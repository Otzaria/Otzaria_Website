'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import ListPager from '@/components/admin/list/ListPager'
import LoadError from '@/components/admin/list/LoadError'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import {
  activeFilterCount, clearFilters, filterOptions, filterPages, filterSummary, isUserId, serializePagesQuery, updatePagesQuery,
} from '@/lib/adminPagesScreen/pagesQuery'
import {
  DOWNLOAD_ALL_CONFIRM_ABOVE, downloadAllConfirm, formatNumber,
} from '@/lib/adminPagesScreen/pageTerms'
import ChangeStatusDialog from './ChangeStatusDialog'
import PageRow, { PageColumnsHeader } from './PageRow'
import PagesFilterBar from './PagesFilterBar'
import { PagesListSkeleton } from './PagesSkeleton'
import PagesToolbar from './PagesToolbar'
import { downloadAllFiltered, listMatchingPages, locatePage } from './pagesApi'
import { PAGES_DESCRIPTION, PAGES_TITLE } from './pagesScreenText'
import { usePageActions } from './usePageActions'
import { usePagesData } from './usePagesData'
import { usePagesQuery } from './usePagesQuery'
import { SELECTION_CLEARED_TEXT } from '@/components/admin/list/useKeyedSelection'

const TITLE_ID = 'pages-title'
const LIST_ID = 'pages-list'

export default function PagesScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = usePagesQuery()
  const data = usePagesData(query, {
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const ready = data.status === 'ready'

  const filterKey = serializePagesQuery({ ...query, sort: '', page: 1 })
  const [selection, setSelection] = useState({ key: filterKey, rows: new Map(), clearedText: '' })
  if (selection.key !== filterKey) {
    setSelection({ key: filterKey, rows: new Map(), clearedText: selection.rows.size ? SELECTION_CLEARED_TEXT : '' })
  }
  const { patch } = data
  const onChanged = useCallback((list) => {
    patch(list)
    setSelection((previous) => {
      const rows = new Map(previous.rows)
      for (const page of list) if (rows.has(page.id)) rows.set(page.id, page)
      return { ...previous, rows }
    })
  }, [patch])

  const { actions, busy, releasing, bulkProgress, stopping, stopBulk } = usePageActions({ onChanged, toast, confirm })
  const running = bulkProgress !== null

  // פעולה מרובה באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"צא" עוצר אותה. שחרור שעוד ממתין ל"בטל" — רק אזהרת
  // הדפדפן ברענון / סגירה (מעבר בתוך האתר שולח אותו מיד; סגירת הדף — בבקשה ששורדת אותה)
  useBulkLeaveGuard({
    running,
    pending: releasing.size > 0,
    stop: stopBulk,
    confirm,
    body: 'הפעולה עוד רצה. מה שכבר נשלח נשאר; מה שעוד לא נשלח — לא יישלח.',
  })

  const { page } = data
  const showing = ready && (page.page === query.page || page.total === 0)
  const [selecting, setSelecting] = useState(false)
  const busyScreen = running || selecting
  const options = useMemo(() => filterOptions(data.options), [data.options])

  // ----- הכתובת: משתמש לא תקין / לא קיים — הסינון שלו מוסר, עם הודעה; ערך לא תקין או עמוד שלא קיים — מתוקן -----
  const shownToast = useRef('')
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('user') || ''
    const bad = raw && !isUserId(raw)
    const unknown = query.user && data.options.ready && !data.options.users.some((u) => u.id === query.user)
    if ((bad || unknown) && shownToast.current !== raw) {
      shownToast.current = raw
      toast.show({ tone: 'info', message: 'המשתמש שבכתובת לא נמצא. הסינון לפי משתמש הוסר.' })
      if (unknown) setQuery(updatePagesQuery(query, { user: '' }))
    }
  }, [query, data.options, setQuery, toast])
  useEffect(() => {
    if (running) return
    const normalized = serializePagesQuery({ ...query, page: ready ? page.page : query.page })
    if (normalized !== window.location.search) setQuery({ ...query, page: ready ? page.page : query.page })
  }, [ready, query, page.page, setQuery, running])

  const changeQuery = useCallback((patchQuery) => { if (!busyScreen) setQuery(updatePagesQuery(query, patchQuery)) }, [query, setQuery, busyScreen])
  const clearAll = useCallback(() => { if (!busyScreen) setQuery(clearFilters(query)) }, [query, setQuery, busyScreen])
  const goToPage = useCallback((n) => {
    if (busyScreen) return
    setQuery(updatePagesQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery, busyScreen])

  const [jumpTarget, setJumpTarget] = useState(null)
  const lastFocusedJump = useRef(null)
  const queryKey = serializePagesQuery(query)
  const queryRef = useRef(queryKey)
  useEffect(() => { queryRef.current = queryKey }, [queryKey])
  const jump = useCallback(async (number) => {
    try {
      const target = await locatePage(query, number)
      if (queryRef.current !== queryKey) return
      if (!target) {
        toast.show({ tone: 'info', message: `אין ברשימה עמוד ${formatNumber(number)} ב"${query.book}".` })
        return
      }
      setJumpTarget({ ...target, filterKey })
      if (target.page !== query.page) setQuery(updatePagesQuery(query, { page: target.page }), { push: true })
    } catch (error) {
      toast.show({ tone: 'error', message: error.message })
    }
  }, [query, queryKey, setQuery, toast, filterKey])

  useEffect(() => {
    if (!showing || !jumpTarget || lastFocusedJump.current === jumpTarget || jumpTarget.page !== page.page || jumpTarget.filterKey !== filterKey) return
    const li = document.querySelector(`[data-row="${CSS.escape(jumpTarget.id)}"]`)
    if (!li) return
    lastFocusedJump.current = jumpTarget
    li.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    li.querySelector('input[type="checkbox"], button')?.focus({ preventScroll: true })
  }, [showing, jumpTarget, page.page, filterKey])

  const selected = useMemo(() => new Set([...selection.rows.keys()].filter((id) => !releasing.has(id))), [selection.rows, releasing])
  const pageIds = page.items.filter((p) => !releasing.has(p.id)).map((p) => p.id)
  const select = (ids, checked) => {
    if (busyScreen) return
    const targets = new Set(ids)
    setSelection((previous) => {
      const rows = new Map(previous.rows)
      if (checked) {
        for (const row of page.items) if (targets.has(row.id)) rows.set(row.id, row)
      } else {
        for (const id of ids) rows.delete(id)
      }
      return { ...previous, rows, clearedText: '' }
    })
  }
  const clearSelection = () => {
    if (!busyScreen) setSelection({ key: filterKey, rows: new Map(), clearedText: SELECTION_CLEARED_TEXT })
  }
  const selectAll = async () => {
    if (busyScreen) return
    setSelecting(true)
    try {
      const rows = await listMatchingPages(query)
      setSelection((previous) => {
        if (previous.key !== filterKey) return previous
        const next = new Map(rows.filter((row) => !releasing.has(row.id)).map((row) => [row.id, row]))
        return { ...previous, rows: next, clearedText: '' }
      })
    } catch (error) {
      toast.show({ tone: 'error', message: error.message })
    } finally {
      setSelecting(false)
    }
  }
  const selectedPages = useMemo(
    () => filterPages([...selection.rows.values()].filter((row) => selected.has(row.id)), query, undefined, selected),
    [selection.rows, selected, query],
  )
  const releasable = selectedPages.filter((p) => p.status === 'in-progress').length

  const [bulkWorking, setBulkWorking] = useState(false)
  const onBulk = useCallback(async (action) => {
    if (bulkWorking || selecting || selectedPages.length === 0) return
    setBulkWorking(true)
    try {
      const keep = new Set(await actions.bulk(action, selectedPages))
      setSelection((previous) => previous.key === filterKey
        ? { ...previous, rows: new Map([...previous.rows].filter(([id]) => keep.has(id))) }
        : previous)
    } finally {
      setBulkWorking(false)
    }
  }, [bulkWorking, selecting, selectedPages, actions, filterKey])

  // ----- "שנה מצב…" — החלון הוא האישור -----
  const [statusPage, setStatusPage] = useState(null)
  const openStatus = useCallback((p) => { if (!running) setStatusPage(p) }, [running])

  const refreshAll = async () => {
    if (await data.refresh()) {
      toast.show({ message: 'הרשימה עודכנה' })
    }
  }
  const downloadAll = async () => {
    if (page.total > DOWNLOAD_ALL_CONFIRM_ABOVE && !(await confirm(downloadAllConfirm(page.total)))) return
    downloadAllFiltered(query)
  }
  const filters = activeFilterCount(query)
  const empty = ready && page.total === 0 ? (filters === 0 ? 'all' : 'filtered') : null

  const headerMenu = [
    { id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll },
    // הקובץ של השרת יודע רק מצב, ספר ומשתמש — עם "בלי שינוי יותר מ-" הוא היה כולל עמודים שלא מוצגים
    ...(query.stale || !ready || page.total === 0 ? [] : [{
      id: 'download-all',
      icon: 'download',
      label: `הורד טקסט של כל ${page.total === 1 ? 'העמוד' : `${formatNumber(page.total)} העמודים`}${filters > 0 ? ' המסוננים' : ''}`,
      onSelect: downloadAll,
    }]),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <AdminScreenHeader id={TITLE_ID} title={PAGES_TITLE} description={PAGES_DESCRIPTION} menuItems={headerMenu} />

      <PagesFilterBar query={query} options={options} onChange={changeQuery} onClear={clearAll} disabled={busyScreen} />

      {(data.status === 'loading' || (ready && !showing)) && (
        <div aria-busy="true">
          <p role="status" className="sr-only">טוען את העמודים…</p>
          <PagesListSkeleton />
        </div>
      )}
      {data.status === 'error' && (
        <LoadError
          error={data.error}
          title="לא הצלחנו לטעון את העמודים"
          sessionText="התחבר מחדש כדי לראות את העמודים. אחרי ההתחברות תחזור לכאן."
          onRetry={data.retry}
        />
      )}

      {showing && (
        <section id={LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} className="flex min-w-0 flex-col gap-3 outline-none">
          {empty === 'all' && <EmptyState icon="description" title="אין עמודים" description="כשיעלו ספר לעבודה, העמודים שלו יופיעו כאן." />}
          {empty === 'filtered' && (
            <EmptyState
              role="status"
              icon="search_off"
              title="אין עמודים שמתאימים לסינון"
              description={`הסינון: ${filterSummary(query, options).join(' · ')}`}
              actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={clearAll}>נקה סינון</Button>}
            />
          )}
          {!empty && (
            <>
              <PagesToolbar
                pageIds={pageIds}
                selected={selected}
                onSelect={select}
                onSelectAll={selectAll}
                onClear={clearSelection}
                clearedText={selection.clearedText}
                total={page.total}
                onJump={query.book && !running ? jump : undefined}
                sort={query.sort}
                onSortChange={(sort) => changeQuery({ sort })}
                releasable={releasable}
                working={bulkWorking || selecting}
                selecting={selecting}
                onBulk={onBulk}
                progress={bulkProgress}
                stopping={stopping}
                onStop={stopBulk}
              />
              <Card as="div" className="@container overflow-hidden">
                <PageColumnsHeader />
                <ul aria-label={filters > 0 ? 'העמודים שמתאימים לסינון' : 'העמודים'} className="divide-y divide-outline-variant/60">
                  {page.items.map((p) => (
                    <PageRow
                      key={p.id}
                      page={p}
                      selected={selected.has(p.id)}
                      onSelect={select}
                      releasing={releasing.has(p.id)}
                      busy={busy.has(p.id)}
                      locked={busyScreen}
                      hideStatus={query.status}
                      onRelease={actions.release}
                      onCancelRelease={actions.cancelRelease}
                      onDownload={actions.download}
                      onChangeStatus={openStatus}
                    />
                  ))}
                </ul>
              </Card>
              <ListPager page={page} onChange={goToPage} disabled={busyScreen} prefix="עמודים" />
            </>
          )}
        </section>
      )}

      {statusPage && (
        <ChangeStatusDialog
          page={statusPage}
          onCancel={() => setStatusPage(null)}
          onConfirm={(to) => {
            const target = statusPage
            setStatusPage(null)
            actions.changeStatus(target, to)
          }}
        />
      )}
      {confirmElement}
    </div>
  )
}

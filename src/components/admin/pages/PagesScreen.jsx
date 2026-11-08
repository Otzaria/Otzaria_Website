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
  activeFilterCount, clearFilters, filterOptions, filterPages, filterSummary, isUserId, jumpTarget, paginate, serializePagesQuery, updatePagesQuery,
} from '@/lib/adminPagesScreen/pagesQuery'
import {
  DOWNLOAD_ALL_CONFIRM_ABOVE, downloadAllConfirm, formatNumber, loadProgressText, partialLoadNote,
} from '@/lib/adminPagesScreen/pageTerms'
import ChangeStatusDialog from './ChangeStatusDialog'
import PageRow, { PageColumnsHeader } from './PageRow'
import PagesFilterBar from './PagesFilterBar'
import { PagesListSkeleton } from './PagesSkeleton'
import PagesToolbar from './PagesToolbar'
import { downloadAllFiltered } from './pagesApi'
import { PAGES_DESCRIPTION, PAGES_TITLE } from './pagesScreenText'
import { usePageActions } from './usePageActions'
import { usePagesData } from './usePagesData'
import { usePagesQuery } from './usePagesQuery'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'

const TITLE_ID = 'pages-title'
const LIST_ID = 'pages-list'

/** ריק → ריק; אחרת קבוצה חדשה עם הנוספים */
const withIds = (set, ids) => {
  const next = new Set(set)
  for (const id of ids) next.add(id)
  return next
}

/**
 * "עמודים" (/library/admin/pages-management) — למנהל כללי ולמנהל ספרים (מנהל ספרים-בלבד לא רואה, בכוונה; ראו
 * proxy.js). המטרה: למצוא עמודים תקועים בכל הספרים ולשחרר אותם. אותן בקשות לשרת כמו המסך הקודם (pagesApi).
 *
 * סינון (מצב · ספר · משתמש · "בלי שינוי יותר מ-"), מיון ועמוד — בכתובת (ערך לא תקין — מתוקן בכתובת). מצב, ספר
 * ומשתמש — בשרת; השאר — כאן. כשבשרת יותר מ-5,000 — ההמשך נטען ("טוען… 10,000 מתוך 14,617"), עד תקרה.
 * שורה: "שחרר" (עם "בטל" לכמה שניות, בלי חלון אישור) רק בעמוד בעבודה; ⋮ — "הורד טקסט", "פתח בעורך", "שנה מצב…".
 * עמוד ששוחרר או שונה כאן — נשאר במקומו (עם "שוחרר" / "עכשיו") עד הרענון הבא או שינוי סינון, גם אם כבר לא מתאים
 * לסינון: כך שורות לא זזות מתחת לסמן.
 * בחירה: נשמרת במעבר בין עמודי הרשימה, ומתאפסת כשהסינון משתנה. פעולות מרובות: "שחרר נבחרים" (חלון אישור עם
 * המספר) ו"הורד טקסט" — עם "X מתוך Y" ו"עצור"; בזמן הריצה הסינון, העמוד והבחירה נעולים, ויציאה מהמסך שואלת.
 */
export default function PagesScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = usePagesQuery()
  const data = usePagesData(query, {
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const ready = data.status === 'ready'

  // ----- עמודים ששונו כאן: נשארים במקומם עד רענון / שינוי סינון (נגזר, בלי effect) -----
  const filterKey = serializePagesQuery({ ...query, sort: '', page: 1 })
  const [kept, setKept] = useState({ key: filterKey, ids: new Set() })
  if (kept.key !== filterKey) setKept({ key: filterKey, ids: new Set() })
  const { patch } = data
  const onChanged = useCallback((list) => {
    if (list.length === 0) return
    patch(list)
    setKept((k) => ({ ...k, ids: withIds(k.ids, list.map((p) => p.id)) }))
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

  const filtered = useMemo(() => filterPages(data.pages, query, undefined, kept.ids), [data.pages, query, kept.ids])
  const page = paginate(filtered, query.page)
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

  const changeQuery = useCallback((patchQuery) => { if (!running) setQuery(updatePagesQuery(query, patchQuery)) }, [query, setQuery, running])
  const clearAll = useCallback(() => { if (!running) setQuery(clearFilters(query)) }, [query, setQuery, running])
  const goToPage = useCallback((n) => {
    if (running) return
    setQuery(updatePagesQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery, running])

  // ----- "קפוץ לעמוד" (כשנבחר ספר): לעמוד של הרשימה שבו הוא, והפוקוס לשורה שלו -----
  const jump = useCallback((number) => {
    const target = jumpTarget(filtered, number)
    if (!target) {
      toast.show({ tone: 'info', message: `אין ברשימה עמוד ${formatNumber(number)}${query.book ? ` ב"${query.book}"` : ''}.` })
      return
    }
    if (target.page !== query.page) setQuery(updatePagesQuery(query, { page: target.page }), { push: true })
    // השורה מופיעה אחרי שהכתובת (והעמוד) מתעדכנים — מחכים לה עד שנייה
    let tries = 0
    const focusRow = () => {
      const li = document.querySelector(`[data-row="${CSS.escape(target.id)}"]`)
      if (!li) {
        if (++tries < 20) setTimeout(focusRow, 50)
        return
      }
      li.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      li.querySelector('input[type="checkbox"], button')?.focus({ preventScroll: true })
    }
    setTimeout(focusRow, 0)
  }, [filtered, query, setQuery, toast])

  // ----- בחירה: מתאפסת כשהסינון משתנה (נגזר, בלי effect); נשמרת במעבר עמוד ובמיון -----
  const { ids: selectedIds, clearedText, select, clear: clearSelection, keep: keepSelection } = useKeyedSelection(filterKey, { locked: running })
  const shownIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered])
  // עמוד ששחרורו ממתין ל"בטל" — לא בבחירה (התיבה שלו נעולה)
  const selected = useMemo(() => new Set([...selectedIds].filter((id) => shownIds.has(id) && !releasing.has(id))), [selectedIds, shownIds, releasing])
  const pageIds = page.items.filter((p) => !releasing.has(p.id)).map((p) => p.id)
  const matchingIds = useMemo(() => filtered.filter((p) => !releasing.has(p.id)).map((p) => p.id), [filtered, releasing])
  const selectAll = useCallback(() => select(matchingIds, true), [select, matchingIds])
  const selectedPages = useMemo(() => filtered.filter((p) => selected.has(p.id)), [filtered, selected])
  const releasable = selectedPages.filter((p) => p.status === 'in-progress').length

  const [bulkWorking, setBulkWorking] = useState(false)
  const onBulk = useCallback(async (action) => {
    if (bulkWorking || selectedPages.length === 0) return
    setBulkWorking(true)
    try {
      const keep = await actions.bulk(action, selectedPages, query)
      keepSelection(keep)
    } finally {
      setBulkWorking(false)
    }
  }, [bulkWorking, selectedPages, actions, query, keepSelection])

  // ----- "שנה מצב…" — החלון הוא האישור -----
  const [statusPage, setStatusPage] = useState(null)
  const openStatus = useCallback((p) => { if (!running) setStatusPage(p) }, [running])

  const refreshAll = async () => {
    if (await data.refresh()) {
      setKept((k) => ({ ...k, ids: new Set() }))
      toast.show({ message: 'הרשימה עודכנה' })
    }
  }
  const downloadAll = async () => {
    if (data.total > DOWNLOAD_ALL_CONFIRM_ABOVE && !(await confirm(downloadAllConfirm(data.total)))) return
    downloadAllFiltered(query)
  }
  const filters = activeFilterCount(query)
  const empty = !ready ? null : data.pages.length === 0 && filters === 0 ? 'all' : filtered.length === 0 ? 'filtered' : null
  const note = ready ? partialLoadNote(data.total, data.checked) : null

  const headerMenu = [
    { id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll },
    // הקובץ של השרת יודע רק מצב, ספר ומשתמש — עם "בלי שינוי יותר מ-" הוא היה כולל עמודים שלא מוצגים
    ...(query.stale || !ready || data.total === 0 ? [] : [{
      id: 'download-all',
      icon: 'download',
      label: `הורד טקסט של כל ${data.total === 1 ? 'העמוד' : `${formatNumber(data.total)} העמודים`}${filters > 0 ? ' המסוננים' : ''}`,
      onSelect: downloadAll,
    }]),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <AdminScreenHeader id={TITLE_ID} title={PAGES_TITLE} description={PAGES_DESCRIPTION} menuItems={headerMenu} />

      <PagesFilterBar query={query} options={options} onChange={changeQuery} onClear={clearAll} disabled={running} />

      {data.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="sr-only">{data.loadProgress ? loadProgressText(data.loadProgress.loaded, data.loadProgress.total) : 'טוען את העמודים…'}</p>
          <PagesListSkeleton progress={data.loadProgress ? loadProgressText(data.loadProgress.loaded, data.loadProgress.total) : ''} />
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

      {ready && (
        <section id={LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} className="flex min-w-0 flex-col gap-3 outline-none">
          {empty === 'all' && <EmptyState icon="description" title="אין עמודים" description="כשיעלו ספר לעבודה, העמודים שלו יופיעו כאן." />}
          {empty === 'filtered' && (
            <EmptyState
              role="status"
              icon="search_off"
              title="אין עמודים שמתאימים לסינון"
              description={`הסינון: ${filterSummary(query, options).join(' · ')}${note ? ` (${note.text})` : ''}`}
              actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={clearAll}>נקה סינון</Button>}
            />
          )}
          {!empty && (
            <>
              <PagesToolbar
                pageIds={pageIds}
                matchingIds={matchingIds}
                selected={selected}
                onSelect={select}
                onSelectAll={selectAll}
                onClear={clearSelection}
                clearedText={clearedText}
                total={filtered.length}
                note={note}
                onJump={query.book && !running ? jump : undefined}
                sort={query.sort}
                onSortChange={(sort) => changeQuery({ sort })}
                releasable={releasable}
                working={bulkWorking}
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
                      locked={running}
                      hideStatus={query.status}
                      onRelease={actions.release}
                      onCancelRelease={actions.cancelRelease}
                      onDownload={actions.download}
                      onChangeStatus={openStatus}
                    />
                  ))}
                </ul>
              </Card>
              <ListPager page={page} onChange={goToPage} disabled={running} prefix="עמודים" />
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

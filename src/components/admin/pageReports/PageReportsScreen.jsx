'use client'

import { useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import TabLinks from '@/components/ui/TabLinks'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import ListPager from '@/components/admin/list/ListPager'
import LoadError from '@/components/admin/list/LoadError'
import { TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { useLoadedData } from '@/components/admin/list/useListData'
import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { useFocusAfterRemove } from '@/components/admin/list/useFocusAfterRemove'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import {
  REPORT_TABS, bookOptions, normalizeCounts, parsePageReportsQuery, serializePageReportsQuery, serverPage, statusCount, tabHref,
  updatePageReportsQuery,
} from '@/lib/adminPageReportsScreen/pageReportsQuery'
import {
  KEYBOARD_HINT, PAGE_REPORTS_DESCRIPTION, PAGE_REPORTS_TITLE, TAB_LABELS, emptyText, pendingCountLabel, reportsCountText,
} from '@/lib/adminPageReportsScreen/pageReportsTerms'
import BookErrorCard from './BookErrorCard'
import MessageCard from './MessageCard'
import PageReportsFilters from './PageReportsFilters'
import { ReportCardsSkeleton, ReportFiltersSkeleton } from './PageReportsSkeleton'
import { loadPageReports } from './pageReportsApi'
import { usePageReportActions } from './usePageReportActions'

const TITLE_ID = 'page-reports-title'
const LIST_ID = 'page-reports-list'
const EMPTY = { reports: [], counts: normalizeCounts(null), total: 0, hasMore: false, books: new Map(), loaded: false }

// תשובה חדשה מחליפה את הקודמת; הספרים שכבר נראו נשמרים (לבורר — השרת לא מחזיר רשימת ספרים)
const merge = (previous, loaded) => ({ ...loaded, books: bookOptions(previous.books, loaded.reports).seen, loaded: true })

/**
 * "דיווחים על עמודים" (/library/admin/page-reports): מה שמתנדבים שלחו מעורך העמוד —
 *   "טעויות בספר": טעות בספר המצולם עצמו, עם התיקון המוצע. אשר / דחה, ואפשר גם להחיל על טקסט העמוד.
 *   "הודעות על עמודים": הודעה חופשית על עמוד. "סמן כטופל".
 * הלשונית, המצב, הספר והעמוד — בכתובת (useUrlQuery). השרת מסנן ומעמד, ומחזיר את המונים לכל לשונית ומצב.
 * הכרעה שמוציאה כרטיס מהסינון (אישור בסינון "ממתין") — הכרטיס יוצא, והפוקוס עובר לכרטיס שבא במקומו.
 */
export default function PageReportsScreen() {
  const toast = useToast()
  const pathname = usePathname()
  const [query, setQuery] = useUrlQuery(parsePageReportsQuery, serializePageReportsQuery)
  // הבקשה תלויה רק בכתובת (מחרוזת) — לא בזהות האובייקט, שמשתנה בכל רינדור
  const queryKey = serializePageReportsQuery(query)
  const loader = useCallback(() => loadPageReports(parsePageReportsQuery(new URLSearchParams(queryKey))), [queryKey])
  const data = useLoadedData(loader, {
    initial: EMPTY,
    merge,
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const { listRef, beforeRemove } = useFocusAfterRemove({ rowAttr: 'data-report-card', fallbackId: LIST_ID })
  const { decide, busy, errors, clearMessages } = usePageReportActions({ query, data, toast, beforeRemove })

  const { reports, counts, total, books, loaded } = data.data
  const ready = data.status === 'ready'
  const page = serverPage(query.page, total, reports.length)
  const bookChoices = bookOptions(books, [], query.book).options

  // עמוד שכבר לא קיים (הכרטיס האחרון בעמוד האחרון טופל) — לעמוד הקודם
  useEffect(() => {
    if (ready && reports.length === 0 && query.page > 1) setQuery({ ...query, page: Math.max(1, page.pageCount) })
  }, [ready, reports.length, query, page.pageCount, setQuery])

  const changeQuery = useCallback((patch) => {
    clearMessages()
    setQuery(updatePageReportsQuery(query, patch))
  }, [query, setQuery, clearMessages])

  const goToPage = useCallback((n) => {
    clearMessages()
    setQuery(updatePageReportsQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery, clearMessages])

  const refreshAll = async () => {
    if (await data.refresh()) toast.show({ message: 'הרשימה עודכנה' })
  }

  const tabs = REPORT_TABS.map((kind) => {
    const pending = statusCount(counts, kind, 'pending')
    return { id: kind, href: tabHref(pathname, query, kind), label: TAB_LABELS[kind], count: pending, countLabel: pendingCountLabel(pending) }
  })
  const empty = emptyText(query.kind, query.status, query.book)
  const onFilterBook = query.book ? undefined : (bookPath) => changeQuery({ book: bookPath })
  const Card = query.kind === 'message' ? MessageCard : BookErrorCard

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={PAGE_REPORTS_TITLE}
        description={PAGE_REPORTS_DESCRIPTION}
        menuItems={[{ id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll }]}
      />

      {data.status === 'error' ? (
        <LoadError
          error={data.error}
          title="לא הצלחנו לטעון את הדיווחים"
          sessionText="התחבר מחדש כדי לראות את הדיווחים. אחרי ההתחברות תחזור לכאן."
          onRetry={data.retry}
        />
      ) : (
        <>
          {loaded
            ? <TabLinks label="סוג הדיווח" activeId={query.kind} items={tabs} />
            : <TabsSkeleton labels={REPORT_TABS.map((kind) => ({ label: TAB_LABELS[kind], count: '00' }))} />}

          {loaded ? <PageReportsFilters query={query} counts={counts} books={bookChoices} onChange={changeQuery} /> : <ReportFiltersSkeleton />}

          <section id={LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} aria-busy={!ready || undefined} className="flex min-w-0 flex-col gap-3 outline-none">
            {!ready && (
              <>
                <p role="status" className="sr-only">טוען את הדיווחים…</p>
                <ReportCardsSkeleton />
              </>
            )}
            {ready && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-on-surface-variant">
                  <p role="status">{reportsCountText(total)}</p>
                  {query.kind === 'book_error' && <p className="max-md:hidden">{KEYBOARD_HINT}</p>}
                </div>
                {reports.length === 0 ? (
                  <EmptyState
                    icon={query.status === 'pending' ? 'task_alt' : 'search_off'}
                    title={empty.title}
                    description={empty.description}
                    actions={query.book ? <Button variant="tonal" size="sm" icon="filter_alt_off" onClick={() => changeQuery({ book: '' })}>כל הספרים</Button> : undefined}
                  />
                ) : (
                  <ul ref={listRef} aria-label={TAB_LABELS[query.kind]} className="flex flex-col gap-3">
                    {reports.map((report) => {
                      const id = String(report._id)
                      return (
                        <Card
                          key={id}
                          report={report}
                          busy={busy.has(id)}
                          error={errors.get(id) || null}
                          onDecide={decide}
                          onFilterBook={onFilterBook}
                        />
                      )
                    })}
                  </ul>
                )}
                <ListPager page={page} onChange={goToPage} prefix="דיווחים" />
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

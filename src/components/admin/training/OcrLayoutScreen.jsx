'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SelectMenu from '@/components/ui/SelectMenu'
import TabLinks from '@/components/ui/TabLinks'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { errorToast, startDownload } from '@/components/admin/list/adminRequest'
import { useLoadedData } from '@/components/admin/list/useListData'
import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { formatNumber } from '@/lib/adminTerms'
import { SCREEN_TEXT, STATUS_LABELS, pagesCountText } from '@/lib/adminTrainingScreen/trainingTerms'
import { moveCount } from '@/lib/adminTrainingScreen/ocrLinesQuery'
import {
  LAYOUT_KINDS, LAYOUT_KIND_HINTS, LAYOUT_KIND_LABELS, LAYOUT_TABS, activeFilters, parseLayoutQuery, serializeLayoutQuery,
} from '@/lib/adminTrainingScreen/ocrLayoutQuery'
import ImportBatchDrawer from './ImportBatchDrawer'
import LayoutPageCard from './LayoutPageCard'
import LayoutReviewModal from './LayoutReviewModal'
import { TrainingCardsSkeleton } from './TrainingSkeleton'
import { LAYOUT_EXPORT_HREF, deleteLayout, loadLayout, patchLayout } from './trainingApi'
import { useFocusAfterRemove } from '@/components/admin/list/useFocusAfterRemove'

const TITLE_ID = 'ocr-layout-title'
const EMPTY = { pages: [], total: 0, counts: { available: 0, submitted: 0, approved: 0 }, facets: { batches: [], editions: [] } }
const KIND_OPTIONS = LAYOUT_KINDS.map((value) => ({ value, label: LAYOUT_KIND_LABELS[value], hint: LAYOUT_KIND_HINTS[value] }))
/** סרגל הסינון: בטלפון — עמודה אחת ברוחב מלא; ברוחב בינוני — שניים בשורה; ברחב — שלושה בשורה (כמו במסך העמודים) */
const FILTER_GRID = 'grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-[repeat(3,minmax(0,13rem))_auto] @3xl:items-end'
const EMPTY_TEXT = {
  submitted: ['אין עמודים שממתינים לאישור', 'כשמתנדב יסיים לתייג עמוד, הוא יופיע כאן.'],
  approved: ['אין עדיין עמודים מאושרים', 'עמוד שתאשר יעבור לכאן.'],
  available: ['אין עמודים פנויים', 'כל העמודים כבר תויגו. אפשר לייבא עוד עמודים.'],
}
const nameOf = (p) => `${p.edition} / ${p.pageStem}`

/**
 * "תיוג מבנה" (/library/admin/ocr-layout): לשוניות ממתין לאישור · מאושר · פנוי (עם מונים), סינון לפי קבוצה, מהדורה
 * וסוג משימה (בכתובת), כרטיס לכל עמוד עם "פתח" (חלון הסקירה — כרטיסי המשימות של המתנדב, בלי שינוי), "אשר" ·
 * "שלח לסימון מחדש" · ⋮. בכותרת: "ייבא עמודים" (מגירה) ו-⋮ (הורד את המאושרים, רענן). אותן בקשות לשרת כמו קודם.
 */
export default function OcrLayoutScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = useUrlQuery(parseLayoutQuery, serializeLayoutQuery)
  // הבקשה תלויה רק בערכי הסינון (לא בזהות האובייקט של הכתובת)
  const { tab, batch, edition, kind } = query
  const loader = useCallback(() => loadLayout({ tab, batch, edition, kind }), [tab, batch, edition, kind])
  const data = useLoadedData(loader, {
    initial: EMPTY,
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const { pages, total, counts, facets } = data.data
  const ready = data.status === 'ready'
  const [busy, setBusy] = useState(() => new Set())
  // "הצג עוד" שבאוויר — שייך לסינון שבו התחיל (בשינוי לשונית / סינון — כבר לא "טוען", והתשובה לא נכנסת)
  const queryKey = serializeLayoutQuery(query)
  const queryKeyRef = useRef(queryKey)
  useEffect(() => { queryKeyRef.current = queryKey }, [queryKey])
  const [loadingMoreKey, setLoadingMoreKey] = useState(null)
  const loadingMore = loadingMoreKey === queryKey
  const loadMoreId = useRef(0)
  const [reviewId, setReviewId] = useState(null)
  const [importing, setImporting] = useState(false)
  const reviewPage = pages.find((p) => p.id === reviewId) || null

  // busyIds — בדיקה מיידית (לחיצה כפולה שולחת פעם אחת, גם לפני שהמצב התעדכן)
  const busyIds = useRef(new Set())
  const markBusy = (id, on) => {
    if (on) busyIds.current.add(id)
    else busyIds.current.delete(id)
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const { setData } = data
  const removeLocal = useCallback((id, from, to) => setData((d) => ({
    ...d, pages: d.pages.filter((p) => p.id !== id), total: Math.max(0, d.total - 1), counts: moveCount(d.counts, from, to),
  })), [setData])
  const { beforeRemove: focusNext } = useFocusAfterRemove({ rowAttr: 'data-layout-row' })
  /** עמוד יצא מהלשונית — הפוקוס עובר לכרטיס הבא */
  const removeOne = useCallback((page, from, to) => {
    focusNext([page.id])
    removeLocal(page.id, from, to)
  }, [focusNext, removeLocal])

  const act = useCallback(async (page, fn, fallback) => {
    if (busyIds.current.has(page.id)) return null
    markBusy(page.id, true)
    try {
      return await fn()
    } catch (e) {
      toast.show(errorToast(e, fallback))
      return null
    } finally {
      markBusy(page.id, false)
    }
  }, [toast])

  const onApprove = useCallback(async (page) => {
    const res = await act(page, () => patchLayout(page.id, { action: 'approve' }, 'לא הצלחנו לאשר את העמוד.'), 'לא הצלחנו לאשר את העמוד.')
    if (res) {
      removeOne(page, 'submitted', 'approved')
      setReviewId((r) => (r === page.id ? null : r))
      toast.show({ message: `${nameOf(page)} — אושר` })
    }
  }, [act, removeOne, toast])

  const onReturn = useCallback(async (page) => {
    const ok = await confirm({
      title: `לשלוח את ${nameOf(page)} לסימון מחדש?`,
      body: [
        'מה שהמתנדב סימן יימחק, והעמוד יחזור להיות פנוי — מתנדב יסמן אותו מההתחלה.',
        page.status === 'approved' ? 'העמוד כבר מאושר — הוא יצא גם מהורדת העמודים המאושרים.' : '',
      ].filter(Boolean).join(' '),
      confirmLabel: 'שלח לסימון מחדש',
    })
    if (!ok) return
    const res = await act(page, () => patchLayout(page.id, { action: 'return' }, 'לא הצלחנו לשלוח את העמוד לסימון מחדש.'), 'לא הצלחנו לשלוח את העמוד לסימון מחדש.')
    if (res) {
      removeOne(page, page.status, 'available')
      toast.show({ message: 'העמוד נשלח לסימון מחדש' })
    }
  }, [act, confirm, removeOne, toast])

  const onDelete = useCallback(async (page) => {
    const ok = await confirm({
      title: `למחוק לצמיתות את ${nameOf(page)}?`,
      body: 'העמוד ומה שסומן בו יימחקו. אי אפשר לבטל.',
      confirmLabel: 'מחק לצמיתות',
      tone: 'danger',
    })
    if (!ok) return
    const res = await act(page, () => deleteLayout(page.id), 'לא הצלחנו למחוק את העמוד.')
    if (res) {
      removeOne(page, page.status, null)
      toast.show({ message: 'העמוד נמחק' })
    }
  }, [act, confirm, removeOne, toast])

  const onSaved = useCallback((id, tasks) => {
    setData((d) => ({ ...d, pages: d.pages.map((p) => (p.id === id ? { ...p, tasks } : p)) }))
    toast.show({ message: 'התיקונים נשמרו' })
  }, [setData, toast])
  const onModalError = useCallback((e, fallback) => toast.show(errorToast(e, fallback)), [toast])

  const onOpen = useCallback((p) => setReviewId(p.id), [])

  const loadMore = async () => {
    if (loadingMore) return
    const id = ++loadMoreId.current
    const startKey = queryKey
    setLoadingMoreKey(startKey)
    try {
      const more = await loadLayout(query, pages.length)
      // בינתיים עברו ללשונית / לסינון אחר — התשובה שייכת לרשימה אחרת
      if (id !== loadMoreId.current || queryKeyRef.current !== startKey) return
      setData((d) => {
        const seen = new Set(d.pages.map((p) => p.id))
        return { ...more, pages: [...d.pages, ...more.pages.filter((p) => !seen.has(p.id))] }
      })
    } catch (e) {
      if (id === loadMoreId.current && queryKeyRef.current === startKey) toast.show(errorToast(e, 'לא הצלחנו לטעון עוד עמודים.'))
    } finally {
      if (id === loadMoreId.current) setLoadingMoreKey(null)
    }
  }
  const refreshAll = async () => {
    if (await data.refresh()) toast.show({ message: 'הרשימה עודכנה' })
  }

  const changeFilter = (patch) => setQuery({ ...query, ...patch })
  const tabHref = (tab) => `/library/admin/ocr-layout${serializeLayoutQuery({ ...query, tab })}`
  // בטלפון — מונה רק ב"ממתין לאישור" (כך שלוש הלשוניות נכנסות גם ב-360); בשם הנגיש — תמיד
  const tabs = LAYOUT_TABS.map((id) => ({
    id, href: tabHref(id), label: STATUS_LABELS[id], count: counts[id] ?? 0, countLabel: pagesCountText(counts[id] ?? 0), countOnPhone: id === 'submitted',
  }))
  const batchOptions = useMemo(() => (facets?.batches || []).map((b) => ({ value: b, label: b })), [facets])
  const editionOptions = useMemo(() => (facets?.editions || []).map((e) => ({ value: e, label: e })), [facets])
  const filters = activeFilters(query)
  const nothingAtAll = counts.available + counts.submitted + counts.approved === 0
  const [emptyTitle, emptyText] = EMPTY_TEXT[query.tab]
  const menuItems = [
    { id: 'download', icon: 'download', label: 'הורד את העמודים המאושרים', disabled: !counts.approved, onSelect: () => startDownload(LAYOUT_EXPORT_HREF) },
    { separator: true, id: 'sep' },
    { id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll },
  ]

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={SCREEN_TEXT.layout.title}
        description={SCREEN_TEXT.layout.description}
        action={(
          // בטלפון צר מאוד — אייקון בלבד (השם נשאר לקורא המסך), כדי שהכותרת לא תישבר לשתי שורות
          <Button variant="filled" size="sm" icon="upload_file" onClick={() => setImporting(true)}>
            <span className="max-[380px]:sr-only">ייבא עמודים</span>
          </Button>
        )}
        menuItems={menuItems}
      />
      {data.status === 'error' ? (
        <LoadError error={data.error} title="לא הצלחנו לטעון את עמודי התיוג" sessionText="התחבר מחדש כדי לראות את העמודים. אחרי ההתחברות תחזור לכאן." onRetry={data.retry} />
      ) : (
        <>
          {data.data !== EMPTY
            ? <TabLinks label="העמודים לפי מצב" activeId={query.tab} items={tabs} />
            : <TabsSkeleton labels={LAYOUT_TABS.map((id) => ({ label: STATUS_LABELS[id], count: '00' }))} />}
          <div className="@container">
          <div className={FILTER_GRID}>
            <SelectMenu label="קבוצה" options={batchOptions} value={query.batch} allLabel="הכול" placeholder="הכול" searchable={batchOptions.length > 8}
              emptyText="לא נמצאה קבוצה" onChange={(batch) => changeFilter({ batch: batch || '' })} />
            <SelectMenu label="מהדורה" options={editionOptions} value={query.edition} allLabel="הכול" placeholder="הכול" searchable={editionOptions.length > 8}
              emptyText="לא נמצאה מהדורה" onChange={(edition) => changeFilter({ edition: edition || '' })} />
            <SelectMenu label="סוג משימה" options={KIND_OPTIONS} value={query.kind} allLabel="הכול" placeholder="הכול" searchable={false}
              onChange={(kind) => changeFilter({ kind: kind || '' })} />
            {filters > 0 && <Button variant="text" size="sm" icon="filter_alt_off" onClick={() => changeFilter({ batch: '', edition: '', kind: '' })} className="justify-self-start">נקה סינון</Button>}
          </div>
          </div>
          {!ready && (
            <div aria-busy="true">
              <p role="status" className="sr-only">טוען את העמודים…</p>
              <TrainingCardsSkeleton imageClassName="h-32 sm:w-36" />
            </div>
          )}
          {ready && pages.length === 0 && (
            nothingAtAll && filters === 0
              ? <EmptyState icon="upload_file" title="אין עדיין עמודים לתיוג" description="ייבא קובץ ZIP מפרויקט ה-OCR כדי להתחיל."
                  actions={<Button variant="filled" size="sm" icon="upload_file" onClick={() => setImporting(true)}>ייבא עמודים</Button>} />
              : filters > 0
                ? <EmptyState role="status" icon="search_off" title="אין עמודים שמתאימים לסינון"
                    actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={() => changeFilter({ batch: '', edition: '', kind: '' })}>נקה סינון</Button>} />
                : <EmptyState icon="task_alt" title={emptyTitle} description={emptyText} />
          )}
          {ready && pages.length > 0 && (
            <section aria-labelledby={TITLE_ID} className="flex min-w-0 flex-col gap-3">
              <p className="text-body-sm text-on-surface-variant tabular-nums">מוצגים {formatNumber(pages.length)} מתוך {formatNumber(total)}</p>
              <ul aria-label="העמודים" className="flex flex-col gap-3">
                {pages.map((page) => (
                  <LayoutPageCard key={page.id} page={page} busy={busy.has(page.id)} onOpen={onOpen}
                    onApprove={onApprove} onReturn={onReturn} onDelete={onDelete} />
                ))}
              </ul>
              {pages.length < total && (
                <Button variant="tonal" size="sm" onClick={loadMore} loading={loadingMore} className="self-center">
                  {loadingMore ? 'טוען…' : `הצג עוד (${formatNumber(total - pages.length)} נוספים)`}
                </Button>
              )}
            </section>
          )}
        </>
      )}
      {reviewPage && (
        <LayoutReviewModal key={reviewPage.id} page={reviewPage} busy={busy.has(reviewPage.id)} confirm={confirm} onClose={() => setReviewId(null)} onSaved={onSaved}
          onApprove={onApprove} onError={onModalError} />
      )}
      {importing && <ImportBatchDrawer onClose={() => setImporting(false)} onImported={() => data.refresh()} />}
      {confirmElement}
    </div>
  )
}

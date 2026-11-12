'use client'

import { useCallback, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import EmptyState from '@/components/ui/EmptyState'
import SelectMenu from '@/components/ui/SelectMenu'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import ListPager from '@/components/admin/list/ListPager'
import LoadError from '@/components/admin/list/LoadError'
import { errorToast, startDownload } from '@/components/admin/list/adminRequest'
import { useListData } from '@/components/admin/list/useListData'
import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { formatNumber } from '@/lib/adminTerms'
import { SCREEN_TEXT, SCRIPT_LABELS, SCRIPT_TYPES, STATUS_LABELS, pagesCountText } from '@/lib/adminTrainingScreen/trainingTerms'
import {
  TRAINING_STATUSES, filterTrainingPages, paginate, parseTrainingPagesQuery, releaseText, serializeTrainingPagesQuery, trainingCounts,
  updateTrainingPagesQuery,
} from '@/lib/adminTrainingScreen/trainingPagesQuery'
import AddTrainingPageDrawer from './AddTrainingPageDrawer'
import TrainingCounters from './TrainingCounters'
import TrainingPageRow, { TrainingColumnsHeader } from './TrainingPageRow'
import { TrainingRowsSkeleton } from './TrainingSkeleton'
import { deleteTrainingPage, loadTrainingPages, releaseTrainingPage, trainingExportHref } from './trainingApi'
import { runSummary, useBulkRun } from '@/components/admin/list/useBulkRun'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { useFocusAfterRemove } from '@/components/admin/list/useFocusAfterRemove'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'

const TITLE_ID = 'ocr-training-title'
const LIST_ID = 'ocr-training-list'
const SCRIPT_OPTIONS = SCRIPT_TYPES.map((value) => ({ value, label: SCRIPT_LABELS[value] }))
const STATUS_OPTIONS = TRAINING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))
const nameOf = (p) => `${p.bookName}, עמוד ${formatNumber(p.pageNumber)}`
/** סרגל הסינון: בטלפון — עמודה אחת ברוחב מלא; מרוחב בינוני — שניים בשורה (כמו במסך העמודים) */
const FILTER_GRID = 'grid grid-cols-1 gap-3 @md:grid-cols-[repeat(2,minmax(0,13rem))_auto] @md:items-end'

/**
 * "עמודים לאימון" (/library/admin/ocr-training): כל העמודים שבמאגר האימון, עם סינון לפי סוג כתב ומצב (בכתובת),
 * מונים קטנים, "הוסף עמוד" (מגירה), שחרור ומחיקה לצמיתות — לבד או לנבחרים. ⋮ בכותרת: הורדת השורות (ZIP).
 * אותן בקשות לשרת כמו המסך הקודם.
 */
export default function TrainingPagesScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = useUrlQuery(parseTrainingPagesQuery, serializeTrainingPagesQuery)
  const list = useListData(loadTrainingPages, {
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const ready = list.status === 'ready'
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(() => new Set())
  // בזו אחר זו (לשרת אין נקודת קצה מרובה; עומס על השרת)
  const bulk = useBulkRun({ limit: 1 })
  const running = bulk.progress !== null
  const { stop: stopBulk } = bulk
  const { setItems, refresh } = list
  // מחיקה מרובה באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר אותה (כמו במסך העמודים)
  useBulkLeaveGuard({ running, stop: stopBulk, confirm, body: 'המחיקה עוד רצה. מה שכבר נמחק — נמחק; מה שעוד לא נשלח — לא יימחק.' })

  const counts = useMemo(() => trainingCounts(list.items), [list.items])
  const shown = useMemo(() => filterTrainingPages(list.items, query), [list.items, query])
  const page = paginate(shown, query.page)
  const filtered = Boolean(query.script || query.status)

  const changeQuery = useCallback((patch, options) => { if (!running) setQuery(updateTrainingPagesQuery(query, patch), options) }, [query, setQuery, running])

  // ----- בחירה: מתאפסת כשהסינון או העמוד משתנים -----
  const queryKey = JSON.stringify([query.script, query.status, page.page])
  const { ids: selectedIds, clearedText, select, clear: clearSelection, keep: keepSelection } = useKeyedSelection(queryKey, { locked: running })
  const pageIds = page.items.filter((p) => !busy.has(p.id)).map((p) => p.id)
  const selected = useMemo(() => new Set([...selectedIds].filter((id) => shown.some((p) => p.id === id))), [selectedIds, shown])
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPage = pageIds.some((id) => selected.has(id))

  const markBusy = (id, on) => setBusy((prev) => {
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })
  const { beforeRemove: focusNext } = useFocusAfterRemove({ rowAttr: 'data-row' })
  /** העמודים יצאו מהרשימה — הפוקוס עובר לשורה הבאה */
  const removeLocal = useCallback((ids) => {
    focusNext(ids)
    setItems((items) => items.filter((p) => !ids.includes(p.id)))
  }, [focusNext, setItems])

  // ----- פעולות על עמוד -----
  const onRelease = useCallback(async (p) => {
    const ok = await confirm({ title: `לשחרר את ${nameOf(p)}?`, body: releaseText(p), confirmLabel: 'שחרר' })
    if (!ok) return
    markBusy(p.id, true)
    try {
      await releaseTrainingPage(p.id)
      setItems((items) => items.map((x) => (x.id === p.id ? { ...x, status: 'available', claimedByName: null } : x)))
      toast.show({ message: `${nameOf(p)} שוחרר` })
      refresh()
    } catch (e) {
      toast.show(errorToast(e, 'לא הצלחנו לשחרר את העמוד.'))
    } finally {
      markBusy(p.id, false)
    }
  }, [confirm, setItems, refresh, toast])

  const onDelete = useCallback(async (p) => {
    const ok = await confirm({
      title: `למחוק לצמיתות את ${nameOf(p)}?`,
      body: 'העמוד יוצא מהעמודים לאימון, וכל השורות שסומנו בו נמחקות. אי אפשר לבטל.',
      confirmLabel: 'מחק לצמיתות',
      tone: 'danger',
    })
    if (!ok) return
    markBusy(p.id, true)
    try {
      await deleteTrainingPage(p.id)
      removeLocal([p.id])
      toast.show({ message: `${nameOf(p)} נמחק` })
    } catch (e) {
      toast.show(errorToast(e, 'לא הצלחנו למחוק את העמוד.'))
    } finally {
      markBusy(p.id, false)
    }
  }, [confirm, toast, removeLocal])

  const onBulkDelete = async () => {
    const items = shown.filter((p) => selected.has(p.id))
    if (items.length === 0 || running) return
    const ok = await confirm({
      title: items.length === 1 ? `למחוק לצמיתות את ${nameOf(items[0])}?` : `למחוק לצמיתות ${pagesCountText(items.length)}?`,
      body: 'העמודים יוצאים מהעמודים לאימון, וכל השורות שסומנו בהם נמחקות. אי אפשר לבטל.',
      confirmLabel: 'מחק לצמיתות',
      tone: 'danger',
    })
    if (!ok) return
    const result = runSummary(await bulk.run(items, (p) => deleteTrainingPage(p.id)))
    const done = result.ok.map((p) => p.id)
    removeLocal(done)
    // מה שנכשל או לא נשלח — נשאר בבחירה
    const left = [...result.failed, ...result.notAttempted]
    keepSelection(left.map((p) => p.id))
    const doneText = done.length === 1 ? 'עמוד אחד נמחק' : `${formatNumber(done.length)} עמודים נמחקו`
    if (result.stopped) {
      const err = result.failed.length ? errorToast(result.lastError, '') : null
      const leftText = left.length === 1 ? 'עמוד אחד נשאר מסומן' : `${formatNumber(left.length)} עמודים נשארו מסומנים`
      toast.show({ tone: err ? 'error' : 'info', message: [`${doneText} · נעצר — ${leftText}.`, err?.message].filter(Boolean).join(' '), action: err?.action })
    } else if (result.failed.length) toast.show(errorToast(result.lastError, `${pagesCountText(result.failed.length)} לא נמחקו.`))
    else toast.show({ message: doneText })
  }

  const refreshAll = async () => {
    if (running) return
    if (await list.refresh()) toast.show({ message: 'הרשימה עודכנה' })
  }
  const onAdded = (message) => {
    toast.show({ message })
    list.refresh()
  }

  const menuItems = [
    { id: 'download-all', icon: 'download', label: 'הורד את כל השורות', onSelect: () => startDownload(trainingExportHref('')) },
    { id: 'download-done', icon: 'download_done', label: 'הורד שורות מעמודים שהושלמו', onSelect: () => startDownload(trainingExportHref('completed')) },
    { separator: true, id: 'sep' },
    { id: 'refresh', icon: 'refresh', label: 'רענן', disabled: running, onSelect: refreshAll },
  ]
  const counterGroups = SCRIPT_TYPES.map((s) => ({
    title: SCRIPT_LABELS[s],
    items: [
      { label: 'פנויים', value: counts.byScript[s].available },
      { label: 'בעבודה', value: counts.byScript[s]['in-progress'] },
      { label: 'הושלמו', value: counts.byScript[s].completed },
    ],
  })).concat([{ items: [{ label: 'שורות עם טקסט', value: counts.filledLines }] }])

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={SCREEN_TEXT.training.title}
        description={SCREEN_TEXT.training.description}
        action={(
          // בטלפון צר מאוד — אייקון בלבד (השם נשאר לקורא המסך), כדי שהכותרת לא תישבר לשתי שורות
          <Button variant="filled" size="sm" icon="add" onClick={() => setAdding(true)} disabled={running}>
            <span className="max-[380px]:sr-only">הוסף עמוד</span>
          </Button>
        )}
        menuItems={menuItems}
      />
      {list.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="sr-only">טוען את העמודים לאימון…</p>
          <TrainingRowsSkeleton />
        </div>
      )}
      {list.status === 'error' && (
        <LoadError error={list.error} title="לא הצלחנו לטעון את העמודים לאימון" sessionText="התחבר מחדש כדי לראות את העמודים. אחרי ההתחברות תחזור לכאן." onRetry={list.retry} />
      )}
      {ready && list.items.length === 0 && (
        <EmptyState
          icon="model_training"
          title="אין עדיין עמודים לאימון"
          description="הוסף עמוד מספר, ומתנדבים יוכלו לסמן בו שורות."
          actions={<Button variant="filled" size="sm" icon="add" onClick={() => setAdding(true)}>הוסף עמוד</Button>}
        />
      )}
      {ready && list.items.length > 0 && (
        <>
          <TrainingCounters label="מונים לפי סוג כתב" groups={counterGroups} />
          <div className="@container">
          <div className={FILTER_GRID}>
            <SelectMenu label="סוג כתב" options={SCRIPT_OPTIONS} value={query.script} allLabel="הכול" placeholder="הכול" searchable={false} disabled={running}
              onChange={(script) => changeQuery({ script: script || '' })} />
            <SelectMenu label="מצב" options={STATUS_OPTIONS} value={query.status} allLabel="הכול" placeholder="הכול" searchable={false} disabled={running}
              onChange={(status) => changeQuery({ status: status || '' })} />
            {filtered && <Button variant="text" size="sm" icon="filter_alt_off" onClick={() => changeQuery({ script: '', status: '' })} softDisabled={running} className="justify-self-start">נקה סינון</Button>}
          </div>
          </div>
          <section id={LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} className="@container flex min-w-0 flex-col outline-none">
            {shown.length === 0 ? (
              <EmptyState
                role="status"
                icon="search_off"
                title="אין עמודים שמתאימים לסינון"
                actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={() => changeQuery({ script: '', status: '' })}>נקה סינון</Button>}
              />
            ) : (
              <>
                <BulkActionBar
                  count={selected.size}
                  countText={selected.size === 1 ? 'עמוד אחד נבחר' : `${formatNumber(selected.size)} עמודים נבחרו`}
                  clearedText={clearedText}
                  locked={running}
                  onClear={clearSelection}
                  selectAll={(
                    <span className="flex size-(--touch-target) shrink-0 items-center justify-center">
                      <Checkbox label="בחר את כל העמודים בדף" checked={allOnPage} indeterminate={!allOnPage && someOnPage} disabled={running || pageIds.length === 0}
                        onChange={(checked) => select(pageIds, checked)} />
                    </span>
                  )}
                  idle={<span className="text-body-sm text-on-surface-variant tabular-nums">{pagesCountText(shown.length)}</span>}
                  actions={running ? (
                    <BulkProgress text={`${formatNumber(bulk.progress.done)} מתוך ${formatNumber(bulk.progress.total)}`} value={bulk.progress.done} max={bulk.progress.total} onStop={bulk.stop} stopping={bulk.stopping} focusStop />
                  ) : (
                    <Button variant="text" size="sm" icon="delete_forever" onClick={onBulkDelete} aria-label="מחק לצמיתות את הנבחרים" className={`${ACTION_BUTTON} text-error`}>
                      <span className={ACTION_TEXT}>מחק לצמיתות</span>
                    </Button>
                  )}
                />
                <TrainingColumnsHeader />
                <ul aria-label="העמודים" className="flex flex-col divide-y divide-outline-variant/60">
                  {page.items.map((p) => (
                    <TrainingPageRow key={p.id} page={p} selected={selected.has(p.id)} busy={busy.has(p.id)} locked={running}
                      onSelect={select} onRelease={onRelease} onDelete={onDelete} />
                  ))}
                </ul>
                <div className="mt-3"><ListPager page={page} onChange={(n) => changeQuery({ page: n }, { push: true })} disabled={running} prefix="עמודים" /></div>
              </>
            )}
          </section>
        </>
      )}
      {adding && <AddTrainingPageDrawer onClose={() => setAdding(false)} onAdded={onAdded} />}
      {confirmElement}
    </div>
  )
}

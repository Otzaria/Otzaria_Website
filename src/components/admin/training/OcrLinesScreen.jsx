'use client'

import ModelTrainingPanel from './ModelTrainingPanel'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import EmptyState from '@/components/ui/EmptyState'
import SelectMenu from '@/components/ui/SelectMenu'
import TabLinks from '@/components/ui/TabLinks'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import LoadError from '@/components/admin/list/LoadError'
import { errorToast, startDownload } from '@/components/admin/list/adminRequest'
import { useLoadedData } from '@/components/admin/list/useListData'
import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { formatNumber } from '@/lib/adminTerms'
import { findForbidden, normalizeLineText } from '@/lib/ocr/textStandard'
import { SCREEN_TEXT, STATUS_LABELS, STATUS_SHORT_LABELS, linesCountText } from '@/lib/adminTrainingScreen/trainingTerms'
import {
  LINES_KEYBOARD_HINT, LINE_POOLS, LINE_TABS, POOL_HINTS, POOL_LABELS, appendLines, approveBlockReason, canApprove, canReturn, lineKeyAction, lineTab,
  moveCount, parseLinesQuery, serializeLinesQuery,
} from '@/lib/adminTrainingScreen/ocrLinesQuery'
import OcrLineCard from './OcrLineCard'
import { TrainingCardsSkeleton } from './TrainingSkeleton'
import { LINES_EXPORT_HREF, deleteLine, loadLines, patchLine } from './trainingApi'
import { runSummary, useBulkRun } from '@/components/admin/list/useBulkRun'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'
import { useFocusAfterRemove } from '@/components/admin/list/useFocusAfterRemove'

// חלון "העמוד המלא" (ui/Dialog; התמונה וסימון השורה — lineHighlight.js); נטען רק כשנפתח
const OcrLineContextModal = dynamic(() => import('@/components/ocr/OcrLineContextModal'), { ssr: false })

const TITLE_ID = 'ocr-lines-title'
const EMPTY = { lines: [], total: 0, counts: { available: 0, submitted: 0, approved: 0, flagged: 0 } }
const POOL_OPTIONS = LINE_POOLS.filter((p) => p !== 'all').map((value) => ({ value, label: POOL_LABELS[value], hint: POOL_HINTS[value] }))
const EMPTY_TEXT = {
  submitted: ['אין שורות שממתינות לאישור', 'כשמתנדב יגיש שורה, היא תופיע כאן.'],
  flagged: ['אין שורות שדורשות בדיקה', 'שורה שמתנדב דיווח שהיא לא קריאה או חתוכה לא נכון — תופיע כאן.'],
  available: ['אין שורות פנויות', 'כל השורות כבר הוקלדו.'],
  approved: ['אין עדיין שורות מאושרות', 'שורה שתאשר תעבור לכאן.'],
}
const FLAGGED_HINT = 'מתנדבים דיווחו שהשורות האלה לא קריאות או חתוכות לא נכון. אם הדיווח שגוי — החזר את השורה לתמלול; אם הוא נכון — מחק אותה לצמיתות (בתפריט ⋮ של השורה).'
const INVALID_DRAFT = 'בטקסט שערכת יש תווים לא מותרים, או שהוא ריק. תקן אותו (או בטל את השינוי) לפני האישור.'
/** עריכה שלא נשמרה ותקינה לשמירה */
const validDraft = (text) => findForbidden(text).length === 0 && !!normalizeLineText(text)
const isTextEntry = (el) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)))
const nameOf = (l) => (l.bookName ? `${l.bookName}, עמוד ${formatNumber(l.pageNumber)}` : 'השורה')

/**
 * "תמלול שורות" (/library/admin/ocr-lines): לשוניות לפי מצב (ממתין לאישור · דורש בדיקה · פנוי · מאושר, עם מונים),
 * בורר מקור (מההגהה / מעמודים לאימון), וכרטיס לכל שורה — תמונה וטקסט לעריכה, "אשר" · "שלח להקלדה מחדש" · ⋮.
 * אשר נבחרים; מקלדת: J K (בכל המסך, חוץ משדות טקסט) / ↑ ↓ (ברשימה), A, R. "הצג עוד" — 50 נוספות. אותן בקשות לשרת כמו המסך הקודם.
 */
export default function OcrLinesScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = useUrlQuery(parseLinesQuery, serializeLinesQuery)
  // הבקשה תלויה רק בלשונית ובמקור (לא בזהות האובייקט של הכתובת)
  const { tab, pool } = query
  const loader = useCallback(() => loadLines({ tab, pool }), [tab, pool])
  const data = useLoadedData(loader, {
    initial: EMPTY,
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const { lines, total, counts } = data.data
  const ready = data.status === 'ready'
  const [busy, setBusy] = useState(() => new Set())
  // "הצג עוד" שבאוויר — שייך ללשונית / למקור שבהם התחיל (במעבר לשונית — כבר לא "טוען")
  const [loadingMoreKey, setLoadingMoreKey] = useState(null)
  const [contextLine, setContextLine] = useState(null)
  // בזו אחר זו (לשרת אין נקודת קצה מרובה; עומס על השרת)
  const bulk = useBulkRun({ limit: 1 })
  const running = bulk.progress !== null
  const { stop: stopBulk } = bulk
  // "אשר נבחרות" באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר (כמו במסך העמודים). הלשוניות והמקור
  // נעולים בזמן הריצה.
  useBulkLeaveGuard({ running, stop: stopBulk, confirm, body: 'האישור עוד רץ. מה שכבר אושר נשאר מאושר; מה שעוד לא נשלח — לא יאושר.' })

  // ----- עריכות טקסט שלא נשמרו (לפי שורה): "אשר" שומר אותן קודם -----
  const drafts = useRef(new Map())
  const onDraft = useCallback((id, base, text) => drafts.current.set(id, { base, text }), [])
  /** הטקסט שנערך ולא נשמר בשורה, או null */
  const draftOf = useCallback((line) => {
    const d = drafts.current.get(line.id)
    return d && d.base === (line.text || '') && d.text !== d.base ? d.text : null
  }, [])
  /** לפני אישור: שומר עריכה שלא נשמרה (אותה בקשת set-text כמו "שמור"); מחזיר את הטקסט שנשמר, או null */
  const saveDraft = useCallback(async (line) => {
    const text = draftOf(line)
    if (text === null) return null
    const res = await patchLine(line.id, { action: 'set-text', text }, 'לא הצלחנו לשמור את הטקסט.')
    drafts.current.delete(line.id)
    return res.text ?? text
  }, [draftOf])

  // ----- בחירה (רק בלשונית "ממתין לאישור"): מתאפסת כשהלשונית או המקור משתנים -----
  const queryKey = `${query.tab}|${query.pool}`
  const queryKeyRef = useRef(queryKey)
  const loadingMore = loadingMoreKey === queryKey
  useEffect(() => { queryKeyRef.current = queryKey }, [queryKey])
  // מעבר לשונית / מקור — הבחירה מתאפסת בלי הכרזה (הרשימה כולה מתחלפת)
  const { ids: selectedIds, clearedText, select, clear: clearSelection, keep: keepSelection } = useKeyedSelection(queryKey, { locked: running, announceReset: false })
  const selectable = query.tab === 'submitted'
  const approvable = lines.filter((l) => canApprove(l) && !busy.has(l.id)).map((l) => l.id)
  const selected = useMemo(() => new Set([...selectedIds].filter((id) => lines.some((l) => l.id === id && canApprove(l)))), [selectedIds, lines])

  const markBusy = (id, on) => setBusy((prev) => {
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })
  const { setData } = data
  const removeLocal = useCallback((id, from, to) => setData((d) => ({
    ...d, lines: d.lines.filter((l) => l.id !== id), total: Math.max(0, d.total - 1), counts: moveCount(d.counts, from, to),
  })), [setData])
  const updateLocal = useCallback((id, patch) => setData((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) })), [setData])
  const { beforeRemove: focusNext } = useFocusAfterRemove({ rowAttr: 'data-line-row' })
  /** שורה אחת יצאה מהלשונית — הפוקוס עובר לשורה הבאה */
  const removeOne = useCallback((line, from, to) => {
    focusNext([line.id])
    removeLocal(line.id, from, to)
  }, [focusNext, removeLocal])

  /** בקשה על שורה אחת, עם סימון "עסוק" והודעת שגיאה */
  const act = useCallback(async (line, fn, fallback) => {
    markBusy(line.id, true)
    try {
      return await fn()
    } catch (e) {
      toast.show(errorToast(e, fallback))
      return null
    } finally {
      markBusy(line.id, false)
    }
  }, [toast])

  const onApprove = useCallback(async (line) => {
    const blocked = approveBlockReason(line)
    if (blocked) {
      toast.show({ tone: 'info', message: blocked })
      return
    }
    const draft = draftOf(line)
    if (draft !== null && !validDraft(draft)) {
      toast.show({ tone: 'error', message: INVALID_DRAFT })
      return
    }
    let savedText = null
    const res = await act(line, async () => {
      savedText = await saveDraft(line)
      return patchLine(line.id, { action: 'approve' }, 'לא הצלחנו לאשר את השורה.')
    }, 'לא הצלחנו לאשר את השורה.')
    if (res) {
      removeOne(line, 'submitted', 'approved')
      toast.show({ message: `${nameOf(line)} — ${savedText !== null ? 'הטקסט נשמר והשורה אושרה' : 'אושרה'}` })
    } else if (savedText !== null) {
      // הטקסט נשמר, האישור נכשל — השדה מציג את מה שנשמר
      updateLocal(line.id, { text: savedText })
    }
  }, [act, draftOf, saveDraft, removeOne, updateLocal, toast])

  const onReturn = useCallback(async (line) => {
    const approved = line.status === 'approved'
    const ok = await confirm({
      title: 'לשלוח את השורה להקלדה מחדש?',
      body: [
        'הטקסט שהוקלד יימחק, והשורה תחזור לרשימת השורות הפנויות — מתנדב יקליד אותה מההתחלה.',
        line.prefill ? 'טיוטת המודל תוצג לו שוב.' : '',
        approved ? 'השורה כבר מאושרת — היא תצא גם מהורדת השורות המאושרות.' : '',
      ].filter(Boolean).join(' '),
      confirmLabel: 'שלח להקלדה מחדש',
    })
    if (!ok) return
    const res = await act(line, () => patchLine(line.id, { action: 'return' }, 'לא הצלחנו לשלוח את השורה להקלדה מחדש.'), 'לא הצלחנו לשלוח את השורה להקלדה מחדש.')
    if (res) {
      removeOne(line, line.status, 'available')
      toast.show({ message: 'השורה נשלחה להקלדה מחדש' })
    }
  }, [act, confirm, removeOne, toast])

  const onDelete = useCallback(async (line) => {
    const ok = await confirm({
      title: 'למחוק את השורה לצמיתות?',
      body: 'השורה והטקסט שלה יימחקו, והיא לא תשמש לאימון. אי אפשר לבטל.',
      confirmLabel: 'מחק לצמיתות',
      tone: 'danger',
    })
    if (!ok) return
    const res = await act(line, () => deleteLine(line.id), 'לא הצלחנו למחוק את השורה.')
    if (res) {
      // שורה שדווחה נספרת בלשונית "דורש בדיקה" (כמו בשרת)
      removeOne(line, lineTab(line), null)
      toast.show({ message: 'השורה נמחקה' })
    }
  }, [act, confirm, removeOne, toast])

  const onUnflag = useCallback(async (line) => {
    const res = await act(line, () => patchLine(line.id, { action: 'unflag' }, 'לא הצלחנו להחזיר את השורה לתמלול.'), 'לא הצלחנו להחזיר את השורה לתמלול.')
    if (res) {
      removeOne(line, 'flagged', 'available')
      toast.show({ message: 'השורה חזרה לתמלול' })
    }
  }, [act, removeOne, toast])

  const onScript = useCallback(async (line, action, scriptType) => {
    const res = await act(line, () => patchLine(line.id, { action, scriptType }, 'לא הצלחנו לעדכן את סוג הכתב.'), 'לא הצלחנו לעדכן את סוג הכתב.')
    if (res) updateLocal(line.id, { scriptType: res.scriptType, suggestedScriptType: null })
  }, [act, updateLocal])

  const onSetText = useCallback(async (line, text) => {
    try {
      const res = await patchLine(line.id, { action: 'set-text', text }, 'לא הצלחנו לשמור את הטקסט.')
      drafts.current.delete(line.id)
      updateLocal(line.id, { text: res.text })
      toast.show({ message: 'הטקסט נשמר' })
    } catch (e) {
      toast.show(errorToast(e, 'לא הצלחנו לשמור את הטקסט.'))
    }
  }, [toast, updateLocal])

  const onBulkApprove = async () => {
    const chosen = lines.filter((l) => selected.has(l.id) && canApprove(l))
    if (chosen.length === 0 || running) return
    // עריכה לא תקינה — השורה לא נשלחת ונשארת בבחירה
    const invalid = chosen.filter((l) => {
      const draft = draftOf(l)
      return draft !== null && !validDraft(draft)
    })
    const items = chosen.filter((l) => !invalid.includes(l))
    const startKey = queryKey
    const result = runSummary(await bulk.run(items, async (l) => {
      await saveDraft(l)
      return patchLine(l.id, { action: 'approve' }, 'לא הצלחנו לאשר את השורה.')
    }))
    if (queryKeyRef.current === startKey) {
      focusNext(result.ok.map((l) => l.id))
      for (const l of result.ok) removeLocal(l.id, 'submitted', 'approved')
      // מה שנכשל, לא נשלח או לא תקין — נשאר בבחירה
      keepSelection([...result.failed, ...result.notAttempted, ...invalid].map((l) => l.id))
    } else {
      // הלשונית / המקור התחלפו באמצע — הנתונים שבמסך כבר אחרים; טוענים מחדש במקום לתקן את המונים ביד
      data.refresh()
    }
    const done = result.ok.length === 1 ? 'שורה אחת אושרה' : `${formatNumber(result.ok.length)} שורות אושרו`
    const left = result.failed.length + result.notAttempted.length + invalid.length
    if (result.stopped) {
      const err = result.failed.length ? errorToast(result.lastError, '') : null
      const leftText = left === 1 ? 'שורה אחת נשארה מסומנת' : `${formatNumber(left)} שורות נשארו מסומנות`
      toast.show({ tone: err ? 'error' : 'info', message: [`${done} · נעצר — ${leftText}.`, err?.message].filter(Boolean).join(' '), action: err?.action })
    } else if (result.failed.length) toast.show(errorToast(result.lastError, `${linesCountText(result.failed.length)} לא אושרו.`))
    else if (invalid.length) toast.show({ tone: 'error', message: `${done}. ${linesCountText(invalid.length)} לא נשלחו — ${INVALID_DRAFT}` })
    else toast.show({ message: done })
  }

  const loadMoreId = useRef(0)
  const loadMore = async () => {
    if (loadingMore) return
    const id = ++loadMoreId.current
    const startKey = queryKey
    setLoadingMoreKey(startKey)
    try {
      const more = await loadLines(query, lines.length)
      // בינתיים עברו ללשונית / למקור אחר — התשובה שייכת לרשימה אחרת
      if (id !== loadMoreId.current || queryKeyRef.current !== startKey) return
      setData((d) => ({ lines: appendLines(d.lines, more.lines), total: more.total, counts: more.counts }))
    } catch (e) {
      if (id === loadMoreId.current && queryKeyRef.current === startKey) toast.show(errorToast(e, 'לא הצלחנו לטעון עוד שורות.'))
    } finally {
      if (id === loadMoreId.current) setLoadingMoreKey(null)
    }
  }

  const refreshAll = async () => {
    if (running) return
    if (await data.refresh()) toast.show({ message: 'הרשימה עודכנה' })
  }

  // ----- מקלדת: J / K בכל המסך (↑ ↓ — בתוך הרשימה), A / R על הכרטיס שבו הפוקוס. לא בשדות טקסט, בתפריט או בחלון -----
  const listRef = useRef(null)
  const onKey = (event) => {
    if (event.defaultPrevented) return
    const target = event.target instanceof Element ? event.target : null
    if (target && (isTextEntry(target) || target.closest('[role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"]'))) return
    if (document.querySelector('[aria-modal="true"]')) return
    const action = lineKeyAction(event)
    const list = listRef.current
    if (!action || !list) return
    const inList = Boolean(target && list.contains(target))
    // חיצים מחוץ לרשימה — נשארים לגלילת הדף
    if (!inList && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) return
    const row = inList ? target.closest('[data-line-row]') : null
    const rows = [...list.querySelectorAll('[data-line-row]')]
    if (action === 'next' || action === 'prev') {
      event.preventDefault()
      if (!row) rows[0]?.focus()
      else rows[rows.indexOf(row) + (action === 'next' ? 1 : -1)]?.focus()
      return
    }
    if (!row) {
      // A / R בלי שורה בפוקוס — אומרים איך מתחילים (רק כשהפוקוס לא על רכיב אחר)
      if (inList || !target || target === document.body) toast.show({ tone: 'info', message: 'קודם בחר שורה — J או ↓ עוברים לשורה הראשונה.' })
      return
    }
    event.preventDefault()
    const line = lines.find((l) => l.id === row.getAttribute('data-line-row'))
    if (!line || running || busy.has(line.id)) return
    if (action === 'approve') onApprove(line)
    else if (action === 'return' && canReturn(line)) onReturn(line)
  }
  const keyHandler = useRef(onKey)
  useEffect(() => { keyHandler.current = onKey })
  useEffect(() => {
    const listener = (event) => keyHandler.current(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  const tabHref = (tab) => `/library/admin/ocr-lines${serializeLinesQuery({ tab, pool: query.pool })}`
  // בטלפון — מונים רק בלשוניות שמחכות להחלטה (כך ארבע הלשוניות נכנסות בשורה); בשם הנגיש — תמיד
  const tabs = LINE_TABS.map((id) => ({
    id, href: tabHref(id), label: STATUS_LABELS[id], shortLabel: STATUS_SHORT_LABELS[id], count: counts[id] ?? 0, countLabel: linesCountText(counts[id] ?? 0), countOnPhone: id === 'submitted' || id === 'flagged',
  }))
  const menuItems = [
    // ההורדה כוללת את המאושרות מכל המקורות (השרת לא מסנן לפי מקור) — חסומה רק כשידוע שאין אף אחת
    { id: 'download', icon: 'download', label: 'הורד את כל השורות המאושרות (מכל המקורות)', disabled: query.pool === 'all' && !counts.approved, onSelect: () => startDownload(LINES_EXPORT_HREF) },
    { separator: true, id: 'sep' },
    { id: 'refresh', icon: 'refresh', label: 'רענן', disabled: running, onSelect: refreshAll },
  ]
  const allSelected = approvable.length > 0 && approvable.every((id) => selected.has(id))
  const [emptyTitle, emptyText] = EMPTY_TEXT[query.tab]

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader id={TITLE_ID} title={SCREEN_TEXT.lines.title} description={SCREEN_TEXT.lines.description} menuItems={menuItems} />
      <ModelTrainingPanel />
      {data.status === 'error' ? (
        <LoadError error={data.error} title="לא הצלחנו לטעון את השורות" sessionText="התחבר מחדש כדי לראות את השורות. אחרי ההתחברות תחזור לכאן." onRetry={data.retry} />
      ) : (
        <>
          {/* הלשוניות נשארות במקומן במעבר בין לשוניות (עם המונים האחרונים) — שלד רק בטעינה הראשונה */}
          {data.data !== EMPTY
            ? <TabLinks label="השורות לפי מצב" activeId={query.tab} items={tabs} disabled={running} />
            : <TabsSkeleton labels={LINE_TABS.map((id) => ({ label: STATUS_LABELS[id], shortLabel: STATUS_SHORT_LABELS[id], count: '00' }))} />}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SelectMenu label="מקור" options={POOL_OPTIONS} value={query.pool === 'all' ? '' : query.pool} allLabel={POOL_LABELS.all} placeholder={POOL_LABELS.all}
              searchable={false} disabled={running} onChange={(pool) => setQuery({ ...query, pool: pool || 'all' })} className="w-48" />
            <p className="text-body-sm text-on-surface-variant max-md:hidden">{LINES_KEYBOARD_HINT}</p>
          </div>
          {query.tab === 'flagged' && <p className="text-body-sm text-on-surface-variant">{FLAGGED_HINT}</p>}
          {!ready && (
            <div aria-busy="true">
              <p role="status" className="sr-only">טוען את השורות…</p>
              <TrainingCardsSkeleton />
            </div>
          )}
          {ready && lines.length === 0 && (
            <EmptyState icon="task_alt" title={emptyTitle} description={query.pool !== 'all' ? `${emptyText} (מקור: ${POOL_LABELS[query.pool]})` : emptyText} />
          )}
          {ready && lines.length > 0 && (
            <section aria-labelledby={TITLE_ID} className="flex min-w-0 flex-col gap-3">
              {selectable && (
                <BulkActionBar
                  count={selected.size}
                  countText={selected.size === 1 ? 'שורה אחת נבחרה' : `${formatNumber(selected.size)} שורות נבחרו`}
                  clearedText={clearedText}
                  locked={running}
                  onClear={clearSelection}
                  selectAll={(
                    <span className="flex size-(--touch-target) shrink-0 items-center justify-center">
                      <Checkbox label="בחר את כל השורות שאפשר לאשר" checked={allSelected} indeterminate={!allSelected && selected.size > 0} disabled={running || approvable.length === 0}
                        onChange={(checked) => select(approvable, checked)} />
                    </span>
                  )}
                  idle={<span className="text-body-sm text-on-surface-variant tabular-nums">מוצגות {formatNumber(lines.length)} מתוך {formatNumber(total)}</span>}
                  actions={running ? (
                    <BulkProgress text={`${formatNumber(bulk.progress.done)} מתוך ${formatNumber(bulk.progress.total)}`} value={bulk.progress.done} max={bulk.progress.total} onStop={bulk.stop} stopping={bulk.stopping} focusStop />
                  ) : (
                    <Button variant="text" size="sm" icon="done_all" onClick={onBulkApprove} aria-label="אשר את הנבחרות" className={ACTION_BUTTON}>
                      <span className={ACTION_TEXT}>אשר נבחרות</span>
                    </Button>
                  )}
                />
              )}
              {!selectable && <p className="text-body-sm text-on-surface-variant tabular-nums">מוצגות {formatNumber(lines.length)} מתוך {formatNumber(total)}</p>}
              <ul ref={listRef} aria-label="השורות" className="flex flex-col gap-3">
                {lines.map((line) => (
                  <OcrLineCard
                    key={line.id}
                    line={line}
                    selectable={selectable}
                    selected={selected.has(line.id)}
                    busy={busy.has(line.id)}
                    locked={running}
                    onSelect={select}
                    onApprove={onApprove}
                    onReturn={onReturn}
                    onDelete={onDelete}
                    onUnflag={onUnflag}
                    onScript={onScript}
                    onSetText={onSetText}
                    onDraft={onDraft}
                    onContext={setContextLine}
                  />
                ))}
              </ul>
              {lines.length < total && (
                <Button variant="tonal" size="sm" onClick={loadMore} loading={loadingMore} disabled={running} className="self-center">
                  {loadingMore ? 'טוען…' : `הצג עוד (${formatNumber(total - lines.length)} נוספות)`}
                </Button>
              )}
            </section>
          )}
        </>
      )}
      {contextLine && <OcrLineContextModal line={contextLine} onClose={() => setContextLine(null)} />}
      {confirmElement}
    </div>
  )
}

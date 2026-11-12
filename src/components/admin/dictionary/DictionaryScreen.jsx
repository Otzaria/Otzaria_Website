'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import SearchField from '@/components/ui/SearchField'
import TabLinks from '@/components/ui/TabLinks'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import ListPager from '@/components/admin/list/ListPager'
import LoadError from '@/components/admin/list/LoadError'
import { loginHref } from '@/components/admin/list/adminRequest'
import { useLoadedData } from '@/components/admin/list/useListData'
import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'
import { TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import {
  DICTIONARY_VIEWS, groupWords, paginate, parseDictionaryQuery, serializeDictionaryQuery, updateDictionaryQuery, viewCounts, visibleWords,
} from '@/lib/adminDictionaryScreen/dictionaryQuery'
import {
  ACTIONS_HINT, DICTIONARY_DESCRIPTION, DICTIONARY_TITLE, KEYBOARD_HINT, VIEW_LABELS, rowKeyAction, wordsCountText,
} from '@/lib/adminDictionaryScreen/dictionaryTerms'
import { loadDictionary } from './dictionaryApi'
import DictionaryToolbar from './DictionaryToolbar'
import { DictionarySearchSkeleton, WordRowsSkeleton } from './DictionarySkeleton'
import { useDictionaryActions } from './useDictionaryActions'
import WordRow, { WordColumnsHeader } from './WordRow'

const TITLE_ID = 'dictionary-title'
const LIST_ID = 'dictionary-list'
const EMPTY = { entries: [], skipped: [] }

const viewHref = (view) => `/library/admin/dictionary${serializeDictionaryQuery({ view, q: '', sort: 'users', page: 1 })}`

/** שדה טקסט — שם המקשים שייכים להקלדה */
const isTextEntry = (el) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)))

/**
 * "הצעות למילון" (/library/admin/dictionary): מילים שמשתמשים הוסיפו למילון האישי שלהם — מילה אחת לכל מילה, עם מי
 * שהוסיף אותה, מהמילה שהכי הרבה משתמשים הוסיפו. לשוניות "ממתינות" / "דולגו", חיפוש, מיון ועמוד — בכתובת.
 * אשר / דלג / הסר — עם "בטל" לכמה שניות (useDictionaryActions); מילה שטופלה נשארת בשורה שלה עד הרענון.
 * מקלדת ברשימה: ↑ ↓ (או J / K) בין המילים, A — אשר, S — דלג (ההסבר — מתחת ללשוניות, ליד ההבדל בין "דלג" ל"הסר").
 * ברשימה "מי הוסיף" — פעולה למשתמש אחד. אותן בקשות לשרת כמו המסך הקודם.
 */
export default function DictionaryScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = useUrlQuery(parseDictionaryQuery, serializeDictionaryQuery)
  const data = useLoadedData(loadDictionary, {
    initial: EMPTY,
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const ready = data.status === 'ready'
  const { actions, busy, busyUsers, handled, pendingActions, bulkProgress, stopping, stopBulk, locked, clearHandled } = useDictionaryActions({ data, toast, confirm })
  const running = bulkProgress !== null

  // פעולה מרובה באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר אותה. פעולה שעוד ממתינה ל"בטל" —
  // רק אזהרת הדפדפן ברענון / סגירה (מעבר בתוך האתר שולח אותה מיד)
  useBulkLeaveGuard({
    running,
    pending: pendingActions.size > 0,
    stop: stopBulk,
    confirm,
    body: 'הפעולה על המילים שנבחרו עוד רצה. מה שכבר נשלח נשאר; מה שעוד לא נשלח — לא יישלח.',
  })

  const words = useMemo(() => groupWords(data.data.entries, data.data.skipped), [data.data])
  const counts = useMemo(() => viewCounts(words), [words])
  const shown = useMemo(() => visibleWords(words, query, handled), [words, query, handled])
  const page = paginate(shown, query.page)

  // מעבר לשונית — הסימונים של מה שטופל יורדים (המילה כבר בלשונית הנכונה)
  const lastView = useRef(query.view)
  useEffect(() => {
    if (lastView.current !== query.view) clearHandled()
    lastView.current = query.view
  }, [query.view, clearHandled])

  // עמוד שכבר לא קיים — הכתובת מתוקנת למה שמוצג
  useEffect(() => {
    if (ready && page.page !== query.page) setQuery({ ...query, page: page.page })
  }, [ready, page.page, query, setQuery])

  const changeQuery = useCallback((patch) => { if (!running) setQuery(updateDictionaryQuery(query, patch)) }, [query, setQuery, running])
  const goToPage = useCallback((n) => {
    if (running) return
    setQuery(updateDictionaryQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery, running])

  // ----- בחירה: מתאפסת כשהלשונית, החיפוש, המיון או העמוד משתנים -----
  const queryKey = JSON.stringify([query.view, query.q, query.sort, page.page])
  const { ids: selectedWords, clearedText, select, clear: clearSelection, keep: keepSelection } = useKeyedSelection(queryKey, { locked: running })
  // מילה שטופלה, שממתינה ל"בטל" או שהבקשות שלה באוויר — לא נבחרת (ולא נשלחת שוב בפעולה מרובה)
  const selectable = (w) => !handled.has(w.word) && !pendingActions.has(w.word) && !busy.has(w.word)
  const pageWords = page.items.filter(selectable).map((w) => w.word)
  const selected = useMemo(() => {
    const available = new Set(shown.filter((w) => !handled.has(w.word) && !pendingActions.has(w.word) && !busy.has(w.word)).map((w) => w.word))
    return new Set([...selectedWords].filter((w) => available.has(w)))
  }, [selectedWords, shown, handled, pendingActions, busy])

  const [bulkWorking, setBulkWorking] = useState(false)
  const onBulk = useCallback(async (action) => {
    if (bulkWorking || locked) return
    const list = shown.filter((w) => selected.has(w.word))
    if (list.length === 0) return
    setBulkWorking(true)
    try {
      const keep = await actions.bulk(action, list)
      keepSelection(keep)
    } finally {
      setBulkWorking(false)
    }
  }, [shown, selected, actions, bulkWorking, locked, keepSelection])

  const refreshAll = async () => {
    if (running) return
    if (await data.refresh()) {
      clearHandled()
      toast.show({ message: 'הרשימה עודכנה' })
    }
  }

  // ----- מקלדת: ↑ ↓ בין השורות, A / S על השורה שבה הפוקוס -----
  const onListKeyDown = (event) => {
    if (!event.currentTarget.contains(event.target) || isTextEntry(event.target) || event.target.closest('[role="menu"],[role="listbox"]')) return
    const action = rowKeyAction(event)
    const row = event.target.closest('[data-word-row]')
    if (!action || !row) return
    // ברשימת המשתמשים A / S לא פועלים על כל המילה
    if ((action === 'approve' || action === 'skip') && event.target.closest('[data-word-users]')) return
    event.preventDefault()
    if (action === 'next' || action === 'prev') {
      const rows = [...event.currentTarget.querySelectorAll('[data-word-row]')]
      const target = rows[rows.indexOf(row) + (action === 'next' ? 1 : -1)]
      target?.focus()
      return
    }
    const word = page.items.find((w) => w.word === row.getAttribute('data-word-row'))
    if (!word || running || locked || busy.has(word.word)) return
    if (action === 'skip' && query.view !== 'pending') return
    actions.act(word, action)
  }

  const empty = !ready ? null : shown.length === 0 ? (query.q ? 'filtered' : 'all') : null
  const tabs = DICTIONARY_VIEWS.map((id) => ({ id, href: viewHref(id), label: VIEW_LABELS[id], count: counts[id], countLabel: wordsCountText(counts[id]) }))

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={DICTIONARY_TITLE}
        description={DICTIONARY_DESCRIPTION}
        menuItems={[{ id: 'refresh', icon: 'refresh', label: 'רענן', disabled: running, onSelect: refreshAll }]}
      />

      {data.status === 'loading' && (
        <div aria-busy="true" className="flex flex-col gap-5">
          <p role="status" className="sr-only">טוען את ההצעות למילון…</p>
          <TabsSkeleton labels={DICTIONARY_VIEWS.map((id) => ({ label: VIEW_LABELS[id], count: '00' }))} />
          <DictionarySearchSkeleton />
          <WordRowsSkeleton />
        </div>
      )}
      {data.status === 'error' && (
        <LoadError
          error={data.error}
          title="לא הצלחנו לטעון את ההצעות למילון"
          sessionText="התחבר מחדש כדי לראות את ההצעות. אחרי ההתחברות תחזור לכאן."
          onRetry={data.retry}
        />
      )}

      {ready && (
        <>
          <TabLinks label="המילים לפי מצב" activeId={query.view} items={tabs} />
          <p className="-mt-2 text-body-sm text-on-surface-variant">
            {ACTIONS_HINT}
            <span className="max-md:hidden"> {KEYBOARD_HINT}</span>
          </p>

          {locked && (
            <Notice
              tone="error"
              role="alert"
              title={locked.sessionExpired ? 'פג תוקף ההתחברות' : 'אין לך הרשאה לעדכן את המילון'}
              action={locked.sessionExpired ? <Button href={loginHref()} variant="filled" size="sm" icon="login">התחבר</Button> : undefined}
            >
              {locked.sessionExpired ? 'התחבר מחדש כדי להמשיך. מה שלא נשמר יישאר ברשימה.' : 'הפעולות במסך הזה הושבתו.'}
            </Notice>
          )}

          <SearchField
            label="חיפוש"
            value={query.q}
            onSearch={(q) => changeQuery({ q })}
            placeholder="חפש מילה או משתמש"
            className="w-full sm:max-w-md"
          />

          <section id={LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} className="@container flex min-w-0 flex-col outline-none">
            {empty === 'all' && (
              query.view === 'pending'
                ? <EmptyState icon="task_alt" title="אין מילים שממתינות" description="כשמשתמש יוסיף מילה למילון האישי שלו, היא תופיע כאן." />
                : <EmptyState icon="task_alt" title="אין מילים שדולגו" description="מילה שתדלג עליה תעבור לכאן, ותוכל לאשר אותה גם אחר כך." />
            )}
            {empty === 'filtered' && (
              <EmptyState
                role="status"
                icon="search_off"
                title="לא נמצאו מילים"
                description={`אין מילה או משתמש שמתאימים ל"${query.q}".`}
                actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={() => changeQuery({ q: '' })}>נקה חיפוש</Button>}
              />
            )}
            {!empty && (
              <>
                <DictionaryToolbar
                  pageWords={pageWords}
                  selected={selected}
                  onSelect={select}
                  onClear={clearSelection}
                  clearedText={clearedText}
                  total={shown.length}
                  view={query.view}
                  sort={query.sort}
                  onSortChange={(sort) => changeQuery({ sort })}
                  working={bulkWorking}
                  onBulk={onBulk}
                  progress={bulkProgress}
                  stopping={stopping}
                  onStop={stopBulk}
                />
                <WordColumnsHeader />
                <ul aria-label={query.view === 'pending' ? 'המילים שממתינות' : 'המילים שדולגו'} onKeyDown={onListKeyDown} className="flex flex-col divide-y divide-outline-variant/60">
                  {page.items.map((word) => {
                    const h = handled.get(word.word)
                    return (
                      <WordRow
                        key={word.word}
                        word={word}
                        view={query.view}
                        selected={selected.has(word.word)}
                        onSelect={select}
                        pending={pendingActions.get(word.word) || null}
                        done={h?.result || null}
                        busy={busy.has(word.word)}
                        locked={running || Boolean(locked)}
                        quiet={selected.size > 0}
                        busyUsers={busyUsers}
                        onAct={actions.act}
                        onCancel={actions.cancel}
                        onActUser={actions.actUser}
                      />
                    )
                  })}
                </ul>
                <div className="mt-3"><ListPager page={page} onChange={goToPage} disabled={running} prefix="מילים" /></div>
              </>
            )}
          </section>
        </>
      )}

      {confirmElement}
    </div>
  )
}

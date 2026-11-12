'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import SearchField from '@/components/ui/SearchField'
import SelectMenu from '@/components/ui/SelectMenu'
import { useToast } from '@/components/ui/Toast'
import LoadError from '@/components/admin/list/LoadError'
import { errorToast } from '@/components/admin/list/adminRequest'
import { useLoadedData } from '@/components/admin/list/useListData'
import { ATTENTION, attentionCount, filterChangeSets, mergeRows, statusOptions, withFailed } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import { ATTENTION_BODY, ATTENTION_STATUSES, attentionText, requestsCountText } from '@/lib/adminBookInfoScreen/bookInfoTerms'
import { listChangeSets } from './bookInfoApi'
import { ChangeSetRowsSkeleton, FiltersSkeleton } from './BookInfoSkeleton'
import ChangeSetRow, { ChangeSetColumnsHeader } from './ChangeSetRow'

const EMPTY = { rows: [], nextCursor: null }
const NO_MORE = { rows: [], nextCursor: undefined, loading: false }

/**
 * "פתוחות": הבקשות הפעילות (active=true), ואיתן אלה שנכשלו מתוך 200 האחרונות (active=false — אותה בקשה כמו
 * "כל הבקשות") — כדי שמנהל יראה שמשהו לא נפתח. כשל בבקשה השנייה — הרשימה מוצגת בלעדיהן.
 */
async function loadView(view) {
  if (view !== 'open') return listChangeSets(view, null)
  const [active, recent] = await Promise.all([listChangeSets('open', null), listChangeSets('all', null).catch(() => null)])
  return { rows: withFailed(active.rows, recent?.rows), nextCursor: active.nextCursor }
}

/**
 * בקשות המיזוג — "פתוחות" או "כל הבקשות", מהחדשה לישנה, עד 200 בכל פעם; "טען עוד בקשות" מוסיף את ההמשך לרשימה.
 * השרת לא מחפש ולא מסנן, ולכן החיפוש והמצב — על מה שנטען; כשאין תוצאות ויש עוד — זה נאמר, עם "טען עוד".
 * כשיש בקשות שמנהל יכול לטפל בהן — הודעה מעל הרשימה עם "הצג רק אותן". אין כאן פעולות מלבד "פתח ב-GitHub":
 * המיזוג והסגירה נעשים שם, והמצב מתעדכן בסנכרון. refreshSignal — "רענן" במסך (חוזר ל-200 האחרונות).
 *
 * @param {{ view: 'open' | 'all', query: { status: string, q: string }, onQueryChange: (patch: object) => void,
 *   refreshSignal: number, onRefreshed: (ok: boolean) => void, onRefreshError: (error: any, retry: () => Promise<boolean>) => void }} props
 */
export default function ChangeSetsView({ view, query, onQueryChange, refreshSignal, onRefreshed, onRefreshError }) {
  const toast = useToast()
  const loader = useCallback(() => loadView(view), [view])
  const data = useLoadedData(loader, { initial: EMPTY, onRefreshError })
  const [more, setMore] = useState(NO_MORE)
  const rows = useMemo(() => (more.rows.length > 0 ? mergeRows(data.data.rows, more.rows) : data.data.rows), [data.data.rows, more.rows])
  const nextCursor = more.nextCursor !== undefined ? more.nextCursor : data.data.nextCursor
  const countRef = useRef(null)

  // "רענן" במסך — טעינה שקטה מחדש (לא בכניסה), מההתחלה
  const seen = useRef(refreshSignal)
  const { refresh } = data
  useEffect(() => {
    if (seen.current === refreshSignal) return
    seen.current = refreshSignal
    refresh().then((ok) => {
      if (ok) setMore(NO_MORE)
      onRefreshed(ok)
    })
  }, [refreshSignal, refresh, onRefreshed])

  const loadMore = async () => {
    if (!nextCursor || more.loading) return
    setMore((m) => ({ ...m, loading: true }))
    try {
      const page = await listChangeSets(view, nextCursor)
      setMore((m) => ({ rows: [...m.rows, ...page.rows], nextCursor: page.nextCursor, loading: false }))
      // הכפתור נעלם כשאין עוד — הפוקוס עובר לשורת הספירה, ולא נופל לתחילת הדף
      if (!page.nextCursor) requestAnimationFrame(() => countRef.current?.focus({ preventScroll: true }))
    } catch (error) {
      setMore((m) => ({ ...m, loading: false }))
      toast.show(errorToast(error, 'לא הצלחנו לטעון את הבקשות הנוספות.'))
    }
  }

  const shown = useMemo(() => filterChangeSets(rows, query), [rows, query])
  const options = useMemo(() => statusOptions(rows), [rows])
  const attention = attentionCount(rows)
  const filtered = Boolean(query.status || query.q)

  if (data.status === 'error') {
    return <LoadError error={data.error} title="לא הצלחנו לטעון את בקשות המיזוג" sessionText="התחבר מחדש כדי לראות את הבקשות. אחרי ההתחברות תחזור לכאן." onRetry={data.retry} />
  }
  if (data.status === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-5">
        <p role="status" className="sr-only">טוען את בקשות המיזוג…</p>
        <FiltersSkeleton />
        <ChangeSetRowsSkeleton />
      </div>
    )
  }

  const noRows = rows.length === 0
  const loadMoreButton = nextCursor
    ? <Button variant="outlined" size="sm" icon="expand_more" loading={more.loading} onClick={loadMore}>טען עוד בקשות</Button>
    : null

  return (
    <div className="flex flex-col gap-5">
      {attention > 0 && query.status !== ATTENTION && !ATTENTION_STATUSES.includes(query.status) && (
        <Notice
          tone="warning"
          title={attentionText(attention)}
          action={<Button variant="outlined" size="sm" icon="filter_list" className="bg-surface" onClick={() => onQueryChange({ status: attentionStatus(options) })}>הצג רק אותן</Button>}
        >
          {ATTENTION_BODY}
        </Notice>
      )}

      {!noRows && (
        <div className="flex items-end gap-2 sm:gap-3">
          <SearchField label="חיפוש" value={query.q} onSearch={(q) => onQueryChange({ q })} placeholder="חפש ספר, מחבר או מי שהציע" className="min-w-0 flex-1 sm:max-w-md" />
          <SelectMenu
            label="מצב"
            hideLabel
            options={options}
            value={query.status}
            allLabel="כל המצבים"
            placeholder="כל המצבים"
            searchable={false}
            onChange={(status) => onQueryChange({ status: status || '' })}
            className="w-36 shrink-0 sm:w-60"
          />
        </div>
      )}

      <section aria-label={view === 'open' ? 'בקשות המיזוג הפתוחות' : 'כל בקשות המיזוג'} className="@container flex min-w-0 flex-col">
        {noRows && (view === 'open'
          ? <EmptyState icon="task_alt" title="אין בקשות פתוחות" description="כשמשתמש ישנה פרטים של ספר, תיפתח כאן בקשת מיזוג חדשה." />
          : <EmptyState icon="task_alt" title="עדיין לא נפתחו בקשות" description="כשמשתמש ישנה פרטים של ספר, תיפתח כאן בקשת מיזוג." />)}
        {!noRows && shown.length === 0 && (
          <EmptyState
            role="status"
            icon="search_off"
            title="אין בקשות שמתאימות לסינון"
            description={nextCursor ? `החיפוש עבר על ${requestsCountText(rows.length)} האחרונות. יש עוד — אפשר לטעון אותן ולחפש גם בהן.` : undefined}
            actions={(
              <>
                {loadMoreButton}
                <Button variant="tonal" size="sm" icon="filter_alt_off" onClick={() => onQueryChange({ status: '', q: '' })}>נקה סינון</Button>
              </>
            )}
          />
        )}
        {shown.length > 0 && (
          <>
            <p ref={countRef} tabIndex={-1} role="status" className="min-h-10 py-2 text-body-sm tabular-nums text-on-surface-variant outline-none">
              {filtered ? `${requestsCountText(shown.length)} מתוך ${rows.length}` : requestsCountText(rows.length)}
              {nextCursor && <span> · יש עוד בקשות מלפני כן</span>}
            </p>
            <ChangeSetColumnsHeader />
            <ul aria-label="הבקשות" className="divide-y divide-outline-variant/60">
              {shown.map((row) => <ChangeSetRow key={row.id} row={row} />)}
            </ul>
            {loadMoreButton && <div className="mt-4 flex justify-center">{loadMoreButton}</div>}
          </>
        )}
      </section>
    </div>
  )
}

/** "הצג רק אותן": כשיש כמה מצבים כאלה — "כל מה שדורש טיפול"; כשיש אחד — הוא עצמו */
function attentionStatus(options) {
  return options.find((o) => o.value === ATTENTION || ATTENTION_STATUSES.includes(o.value))?.value || ATTENTION
}

'use client'

import { useCallback, useState } from 'react'
import TabLinks from '@/components/ui/TabLinks'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { errorToast, saveBlob } from '@/components/admin/list/adminRequest'
import { useListData } from '@/components/admin/list/useListData'
import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { parseBookInfoQuery, serializeBookInfoQuery } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import {
  BOOK_INFO_DESCRIPTION, BOOK_INFO_TITLE, EXPORT_CSV_NAME, EXPORT_LABEL, LIBRARY_FILE_URL, VIEW_LABELS, suggestionsCountText,
} from '@/lib/adminBookInfoScreen/bookInfoTerms'
import { downloadBookInfoCsv, listLegacy } from './bookInfoApi'
import { LegacySkeleton } from './BookInfoSkeleton'
import ChangeSetsView from './ChangeSetsView'
import LegacyView from './LegacyView'

const TITLE_ID = 'book-info-title'
const viewHref = (view) => `/library/admin/book-info${serializeBookInfoQuery({ view, status: '', q: '' })}`

/**
 * "פרטי ספרים" (/library/admin/book-info): בקשות המיזוג ל-book_info.csv — לשוניות "פתוחות" (ברירת מחדל) ו"כל
 * הבקשות", ו"הצעות ישנות" כשיש כאלה (עם המספר — הלוח סופר אותן עם הבקשות הפתוחות). חיפוש ומצב — בכתובת.
 * בכותרת רק ⋮: "רענן", "הורד את קובץ פרטי הספרים (CSV)" (עם "מוריד…" והודעה אם נכשל) ו"פתח את הקובץ ב-GitHub".
 * בקשה שנפתחה מהצעה ישנה מופיעה ב"פתוחות" במעבר אליה — הרשימה נטענת מחדש בכל כניסה ללשונית.
 * אותן בקשות לשרת כמו המסך הקודם (bookInfoApi.js).
 */
export default function BookInfoScreen() {
  const toast = useToast()
  const [query, setQuery] = useUrlQuery(parseBookInfoQuery, serializeBookInfoQuery)
  const onRefreshError = useCallback((_, retry) => toast.show({
    tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry },
  }), [toast])
  const legacy = useListData(listLegacy, { onRefreshError })
  // מה שקורה בלשונית "הצעות ישנות": כמה טופלו (נשארות במקומן עד הרענון, אבל לא נספרות) והאם פעולה מרובה באמצע
  const [legacyState, setLegacyState] = useState({ done: 0, running: false })
  const legacyCount = legacy.status === 'ready' ? Math.max(0, legacy.items.length - legacyState.done) : 0
  // בלי הצעות ישנות (או כשהטעינה שלהן נכשלה) — אין לשונית; כתובת ישנה ?view=legacy מוצגת בכל זאת
  const showLegacyTab = legacyCount > 0 || query.view === 'legacy'
  const view = query.view

  // "רענן": התצוגה הפעילה נטענת שוב, ואחרי שהסתיימה — הודעה אחת
  const [refreshSignal, setRefreshSignal] = useState(0)
  const onRefreshed = useCallback((ok) => { if (ok) toast.show({ message: 'הרשימה עודכנה' }) }, [toast])
  const refreshAll = () => {
    if (legacyState.running) return
    if (view !== 'legacy') legacy.refresh()
    setRefreshSignal((n) => n + 1)
  }
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    if (downloading) return
    setDownloading(true)
    const id = toast.show({ tone: 'info', message: 'מוריד את קובץ פרטי הספרים…' })
    try {
      saveBlob(await downloadBookInfoCsv(), EXPORT_CSV_NAME)
      toast.show({ id, message: 'הקובץ ירד.' })
    } catch (error) {
      toast.show({ ...errorToast(error, 'לא הצלחנו להוריד את הקובץ.'), id })
    } finally {
      setDownloading(false)
    }
  }

  const changeQuery = useCallback((patch) => setQuery({ ...query, ...patch }), [query, setQuery])

  const tabs = [
    { id: 'open', href: viewHref('open'), label: VIEW_LABELS.open },
    { id: 'all', href: viewHref('all'), label: VIEW_LABELS.all },
    ...(showLegacyTab ? [{ id: 'legacy', href: viewHref('legacy'), label: VIEW_LABELS.legacy, count: legacyCount, countLabel: suggestionsCountText(legacyCount) }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={BOOK_INFO_TITLE}
        description={BOOK_INFO_DESCRIPTION}
        menuItems={[
          { id: 'refresh', icon: 'refresh', label: 'רענן', disabled: legacyState.running, onSelect: refreshAll },
          { id: 'download', icon: 'download', label: EXPORT_LABEL, disabled: downloading, onSelect: download },
          { id: 'file', icon: 'open_in_new', label: 'פתח את הקובץ ב-GitHub', onSelect: () => window.open(LIBRARY_FILE_URL, '_blank', 'noopener,noreferrer') },
        ]}
      />

      <TabLinks label="בקשות המיזוג" activeId={view} items={tabs} />

      {view !== 'legacy' && (
        <ChangeSetsView
          key={view}
          view={view}
          query={query}
          onQueryChange={changeQuery}
          refreshSignal={refreshSignal}
          onRefreshed={onRefreshed}
          onRefreshError={onRefreshError}
        />
      )}

      {view === 'legacy' && legacy.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="sr-only">טוען את ההצעות הישנות…</p>
          <LegacySkeleton />
        </div>
      )}
      {view === 'legacy' && legacy.status === 'error' && (
        <LoadError error={legacy.error} title="לא הצלחנו לטעון את ההצעות הישנות" onRetry={legacy.retry} />
      )}
      {view === 'legacy' && legacy.status === 'ready' && (
        <LegacyView data={legacy} toast={toast} refreshSignal={refreshSignal} onRefreshed={onRefreshed} onStateChange={setLegacyState} />
      )}
    </div>
  )
}

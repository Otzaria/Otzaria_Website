'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Ltr from '@/components/ui/Ltr'
import Notice from '@/components/ui/Notice'
import Skeleton from '@/components/ui/Skeleton'
import Tabs, { tabPanelProps } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { requestJson } from '@/components/admin/list/adminRequest'
import { formatNumber, fullDateText } from '@/lib/adminTerms'
import {
  DEFAULT_TAB, countTables, searchFeedbackTabItems, summaryText, tabFromSearch,
} from '@/lib/adminSearchFeedbackScreen/searchFeedbackTerms'
import CountTable from './CountTable'
import ExportDialog from './ExportDialog'
import KeysTable from './KeysTable'
import PurgeDialog from './PurgeDialog'
import { adminScreenTitle } from '@/lib/adminNav'
import { stateForUrlReplace } from '@/lib/historyState'

const STATS_URL = '/api/search-feedback/admin/stats'
const LOAD_FAILED = 'לא הצלחנו לטעון את נתוני המשוב.'

/**
 * מסך "משוב חיפוש" (/library/admin/search-feedback): כותרת עם ⋮ (רענן · הורד נתונים · ── נקה משוב), ושתי לשוניות —
 * סיכום (טבלאות הספירה) והתקנות (חסימה / ביטול חסימה). הנתונים — GET stats, כמו קודם; fresh=1 עוקף את מטמון השרת
 * (ברענון ידני ואחרי שינוי). ההורדה והניקוי — בדיאלוגים, עם אותן בקשות.
 */
export default function SearchFeedbackScreen() {
  const toast = useToast()
  const [tab, setTab] = useState(DEFAULT_TAB)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState({ key: 0, fresh: false })
  const [dialog, setDialog] = useState(null)

  useEffect(() => {
    const fromUrl = tabFromSearch(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- הלשונית מהכתובת, אחרי ה-hydration
    if (fromUrl) setTab(fromUrl)
  }, [])

  useEffect(() => {
    let cancelled = false
    // requestJson: הפניה לדף ההתחברות / 401 — "פג תוקף" עם "התחבר" (LoadError); שבת ושגיאת שרת — בעברית
    requestJson(`${STATS_URL}${reload.fresh ? '?fresh=1' : ''}`, { fallback: LOAD_FAILED })
      .then((json) => {
        if (cancelled) return
        setError(null)
        setData(json)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err)
        setData(null)
      })
    return () => { cancelled = true }
  }, [reload])

  const refresh = useCallback(() => setReload((r) => ({ key: r.key + 1, fresh: true })), [])

  const choose = (id) => {
    setTab(id)
    try {
      const q = new URLSearchParams(window.location.search)
      if (id === DEFAULT_TAB) q.delete('tab')
      else q.set('tab', id)
      const qs = q.toString()
      window.history.replaceState(stateForUrlReplace(window.history.state), '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    } catch {
      // סביבה בלי history — רק המצב המקומי
    }
  }

  const models = data?.byModel || []
  const menuItems = [
    { id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: () => { setData(null); setError(null); refresh() } },
    { id: 'export', icon: 'download', label: 'הורד נתונים', disabled: !data, onSelect: () => setDialog('export') },
    { separator: true, id: 'sep' },
    { id: 'purge', icon: 'delete_forever', label: 'נקה משוב', danger: true, disabled: !data, onSelect: () => setDialog('purge') },
  ]

  // החלון נפתח מפריט בתפריט ⋮ שכבר לא קיים — בסגירה הפוקוס חוזר לכפתור ⋮ של הכותרת (לא נופל לגוף הדף)
  const rootRef = useRef(null)
  const closeDialog = () => {
    setDialog(null)
    requestAnimationFrame(() => rootRef.current?.querySelector('button[aria-haspopup="menu"]')?.focus())
  }
  const onPurged = (deleted) => {
    closeDialog()
    toast.show({ message: `נמחקו ${formatNumber(deleted)} אירועים` })
    refresh()
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      <AdminScreenHeader
        title={adminScreenTitle('search-feedback')}
        description={(
          <>
            מה המשתמשים עושים עם תוצאות החיפוש לפי משמעות — לאימון המודלים.
            {/* המונים בשורה משלהם — ההסבר לא נעלם כשהם מגיעים, והשורה תופסת מקום כבר בטעינה */}
            <span className="block">{data ? <>{summaryText(data)} · נכון ל-{fullDateText(data.cachedAt)}</> : ' '}</span>
          </>
        )}
        menuItems={menuItems}
      />
      {data && !data.enabled && (
        <Notice tone="warning" title="קליטת המשוב כבויה">
          התוכנה לא שולחת משוב חדש עד שמפעילים אותו בהגדרות השרת (<Ltr>SEARCH_FEEDBACK_ENABLED</Ltr>).
        </Notice>
      )}
      <Tabs label="לשוניות משוב החיפוש" idPrefix="search-feedback" items={searchFeedbackTabItems(data)} value={tab} onChange={choose} className="border-b border-outline-variant" />
      <div {...tabPanelProps('search-feedback', tab)} className="outline-none">
        {error ? (
          <LoadError error={error} title={LOAD_FAILED} onRetry={() => { setError(null); refresh() }} />
        ) : !data ? (
          <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="טוען">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-(--card-radius)" />)}
          </div>
        ) : tab === 'keys' ? (
          <KeysTable keys={data.topKeys || []} onChanged={refresh} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {countTables(data).map((t) => <CountTable key={t.id} title={t.title} rows={t.rows} />)}
          </div>
        )}
      </div>
      {dialog === 'export' && <ExportDialog models={models} onClose={closeDialog} />}
      {dialog === 'purge' && <PurgeDialog models={models} onPurged={onPurged} onClose={closeDialog} />}
    </div>
  )
}

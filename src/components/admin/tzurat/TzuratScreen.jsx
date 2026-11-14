'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MenuButton from '@/components/ui/MenuButton'
import Tabs, { tabPanelProps } from '@/components/ui/Tabs'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import { SENTINEL, unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { DEFAULT_TAB, statsAfterChange, tabFromLocation, tzuratTabItems } from '@/lib/adminTzuratScreen/tzuratTabs'
import OverviewSection from './OverviewSection'
import UploadsSection from './UploadsSection'
import DisputesSection from './DisputesSection'
import SubmissionsSection from './SubmissionsSection'
import ReportsSection from './ReportsSection'
import ExportCard from './ExportCard'
import GuideEditorCard from './GuideEditorCard'
import TokensCard from './TokensCard'
import useAdminData from './useAdminData'
import { adminScreenTitle } from '@/lib/adminNav'
import { stateForUrlReplace } from '@/lib/historyState'

// מסך "צורת הדף" (/library/admin/tzurat-hadaf): כותרת, ושמונה לשוניות ברכיב Tabs המשותף — מצב · חבילות · מחלוקות ·
// הגשות · דיווחים · הורדות · הנחיות · מפתחות גישה (השמות והמונים ב-lib/adminTzuratScreen/tzuratTabs).
// הלשונית נשמרת בכתובת (#disputes — כמו הקישורים מלוח הניהול), ונקראת גם מ-?tab=. רק הלשונית הפעילה מוצגת וטוענת.
// המונים מ-GET stats (אותה בקשה של לשונית "מצב", פעם אחת למסך, ושוב רק ב"רענן" של "מצב"). אחרי הכרעה / אישור /
// שינוי מצב דיווח הם מתעדכנים מקומית (statsAfterChange) — בלי לפנות לשרת. העלאת חבילה משנה הרבה מספרים בבת אחת:
// אז stats נטען שוב רק כשנכנסים ללשונית "מצב".
// בטלפון בשורה רק "מצב" ושלושת התורים; השאר בתפריט ⋮ של הכותרת, יחד עם "פתח את עמוד המתנדבים".
// שינוי שלא נשמר (הנחיות), העלאה שרצה או מפתח חדש שעוד מוצג — מעבר לשונית (גם בשינוי ה-# בכתובת או "אחורה")
// או יציאה שואלים קודם (useUnsavedChangesGuard).

const VOLUNTEERS_PAGE = '/library/tzurat-hadaf'

const DIRTY_TEXT = {
  guide: 'השינויים בהנחיות לא נשמרו.',
  uploads: 'ההעלאה עוד רצה, ואם תצא היא תיעצר באמצע. אפשר להמשיך אותה אחר כך — בוחרים שוב את אותו קובץ.',
  tokens: 'המפתח החדש עוד מוצג. אם תצא, לא תוכל לראות אותו שוב.',
}

/** הלשונית בכתובת (#id), בלי ?tab= — replaceState, בלי רשומה חדשה בהיסטוריה */
function writeTabToUrl(id) {
  try {
    const q = new URLSearchParams(window.location.search)
    q.delete('tab')
    const qs = q.toString()
    window.history.replaceState(stateForUrlReplace(window.history.state), '', `${window.location.pathname}${qs ? `?${qs}` : ''}#${id}`)
  } catch {
    // סביבה בלי history — רק המצב המקומי
  }
}

export default function TzuratScreen() {
  const router = useRouter()
  const [tab, setTab] = useState(DEFAULT_TAB)
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const stats = useAdminData('stats')
  const [confirm, confirmElement] = useConfirm()
  const { guardLeave } = useUnsavedChangesGuard(dirty, () => confirm(unsavedConfirm(DIRTY_TEXT[tab] || 'השינויים לא נשמרו.')))
  const tabRef = useRef(tab)
  const guardRef = useRef(guardLeave)
  const pendingHash = useRef(null)
  const statsStale = useRef(false)
  useEffect(() => {
    tabRef.current = tab
    guardRef.current = guardLeave
  })

  // מעבר ללשונית (אחרי ההגנה): "מצב" טוען את stats מחדש רק אם העלאה שינתה אותם
  const reloadStats = stats.reload
  const switchTo = useCallback((id) => {
    setDirty(false)
    setTab(id)
    if (id === 'overview' && statsStale.current) {
      statsStale.current = false
      reloadStats()
    }
  }, [reloadStats])

  // הלשונית מהכתובת — אחרי ה-hydration; ושינוי ה-# (קישור עם #, הקלדה בכתובת, "אחורה") — דרך אותה הגנה
  useEffect(() => {
    const first = tabFromLocation(window.location)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- הלשונית מהכתובת, אחרי ה-hydration
    if (first) setTab(first)
    setReady(true)
    const sync = async () => {
      const t = tabFromLocation(window.location)
      if (!t || t === tabRef.current) return
      if (!(await guardRef.current())) {
        writeTabToUrl(tabRef.current)
        return
      }
      switchTo(t)
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [switchTo])

  const choose = useCallback(async (id) => {
    if (id === tab) return
    if (!(await guardLeave())) return
    pendingHash.current = id
    switchTo(id)
  }, [tab, guardLeave, switchTo])

  // ה-# מתעדכן אחרי שההגנה שוחררה: אם היא עוד מסירה את הרשומה הכפולה מההיסטוריה (history.back, אסינכרוני) —
  // מחכים שתסתיים, אחרת ה-# החדש היה נכתב על הרשומה הכפולה ו"אחורה" היה מחזיר ללשונית הקודמת במקום לצאת.
  useEffect(() => {
    const id = pendingHash.current
    if (!id || dirty) return undefined
    pendingHash.current = null
    if (!window.history.state?.[SENTINEL]) {
      writeTabToUrl(id)
      return undefined
    }
    let done = false
    const write = () => {
      if (done) return
      done = true
      window.removeEventListener('popstate', write)
      writeTabToUrl(id)
    }
    window.addEventListener('popstate', write)
    const timer = setTimeout(write, 500)
    return () => {
      clearTimeout(timer)
      write()
    }
  }, [tab, dirty])

  // שינוי מצב מקומי (הכרעה, אישור / דחייה, מצב דיווח) — המונים מתעדכנים בלי בקשה לשרת
  const setStats = stats.setData
  const countChange = useCallback((kind, from, to) => setStats((s) => statsAfterChange(s, kind, from, to)), [setStats])
  const uploadsChanged = useCallback(() => {
    statsStale.current = true
  }, [])
  const tabs = tzuratTabItems(stats.data, { pending: !stats.data && !stats.error })
  const phoneTabs = tabs.filter((t) => t.hideOnPhone).map((t) => ({ id: t.id, icon: t.icon, label: t.label, onSelect: () => choose(t.id) }))
  const openVolunteers = { id: 'volunteers', icon: 'open_in_new', label: 'פתח את עמוד המתנדבים', onSelect: () => router.push(VOLUNTEERS_PAGE) }

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        title={adminScreenTitle('tzurat-hadaf')}
        description="בדיקה מול הדפוס: מתנדבים משווים את עמודי הש״ס לדף וילנא, וכאן מכריעים במחלוקות, מאשרים הגשות ומטפלים בדיווחים."
        action={(
          <>
            <MenuButton label="עוד" items={[...phoneTabs, { separator: true, id: 'sep' }, openVolunteers]} className="sm:hidden" />
            <MenuButton label="עוד פעולות" items={[openVolunteers]} className="max-sm:hidden" />
          </>
        )}
      />
      <Tabs label="לשוניות צורת הדף" idPrefix="tzurat" items={tabs} value={tab} onChange={choose} className="border-b border-outline-variant" />
      {ready && (
        <div {...tabPanelProps('tzurat', tab)} className="outline-none">
          {tab === 'overview' && <OverviewSection stats={stats} />}
          {tab === 'uploads' && <UploadsSection onDirty={setDirty} onChanged={uploadsChanged} />}
          {tab === 'disputes' && <DisputesSection onChanged={countChange} />}
          {tab === 'submissions' && <SubmissionsSection onChanged={countChange} />}
          {tab === 'reports' && <ReportsSection onChanged={countChange} />}
          {tab === 'export' && <ExportCard />}
          {tab === 'guide' && <GuideEditorCard onDirty={setDirty} />}
          {tab === 'tokens' && <TokensCard onDirty={setDirty} />}
        </div>
      )}
      {confirmElement}
    </div>
  )
}

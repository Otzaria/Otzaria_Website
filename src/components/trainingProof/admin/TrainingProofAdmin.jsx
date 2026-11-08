'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import MenuButton from '@/components/ui/MenuButton'
import Tabs, { tabPanelProps } from '@/components/ui/Tabs'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import TrainingCounters from '@/components/admin/training/TrainingCounters'
import { SECTION_LABELS } from '@/lib/trainingProof/vocab'
import { PROOF_SECTIONS, PROOF_TABS, approvedTotal, legacyTotal, proofTabItems } from '@/lib/adminTrainingScreen/proofTabs'
import { getJson } from './api'
import ReviewTab from './review/ReviewTab'
import UploadTab from './upload/UploadTab'
import ExportTab from './export/ExportTab'
import VolunteersTab from './volunteers/VolunteersTab'
import GuideTab from './guide/GuideTab'
import LegacyTab from './legacy/LegacyTab'

// מסך הניהול של "הגהה" (לשעבר "הגהה לאימון המודלים"; docs/75 §2; docs/76 §8.3 סשן ד'): מונים בראש,
// ושש לשוניות — לאישור · העלאה · הורדות · מתנדבים · הנחיות · ניקוי נתונים ישנים (השמות ב-lib/adminTrainingScreen/proofTabs).
// הלשונית והחלק נשמרים בכתובת (?tab=…&sec=…), כדי שרענון לא יחזיר להתחלה. "ניקוי נתונים ישנים" מוסתרת כשאין נתונים
// ישנים (GET /legacy הקיים). בטלפון "הנחיות" ו"ניקוי נתונים ישנים" בתפריט ⋮ של הכותרת, כדי שהשאר ייכנסו בשורה.

export const TABS = PROOF_TABS
const SECTIONS = PROOF_SECTIONS

// המונים — שורה קטנה (לא כרטיסים): כמה ממתינים לאישור בכל חלק, וכמה אושרו ועוד לא הורדו למחשב האימון ("התחנה"). עד שנטענו — אותה
// שורה עם מקפים (תופסת את המקום, כדי שהלשוניות לא יזוזו)
const NO_SECTIONS = { ocr: {}, router: {}, frames: {} }
function Counters({ summary }) {
  const s = summary?.sections || NO_SECTIONS
  return (
    <TrainingCounters
      label="מונים"
      groups={[
        {
          title: 'ממתינים לאישור',
          items: [
            { label: SECTION_LABELS.ocr, value: s.ocr?.submitted ?? null },
            { label: SECTION_LABELS.router, value: s.router?.submitted ?? null },
            { label: `${SECTION_LABELS.frames} (עמודים)`, value: s.frames?.submitted ?? null },
          ],
        },
        { items: [{ label: 'אושרו ועוד לא הורדו', value: summary ? approvedTotal(summary) : null }] },
      ]}
    />
  )
}

export default function TrainingProofAdmin() {
  const [tab, setTab] = useState('review')
  const [sec, setSec] = useState('ocr')
  const [summary, setSummary] = useState(null)
  const [ready, setReady] = useState(false)
  const [legacyEmpty, setLegacyEmpty] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- הלשונית מהכתובת, אחרי ה-hydration
    if (TABS.some((t) => t.id === q.get('tab'))) setTab(q.get('tab'))
    if (SECTIONS.includes(q.get('sec'))) setSec(q.get('sec'))
    setReady(true)
  }, [])
  // כותבים לכתובת רק אחרי שנקראה — אחרת ההרצה הכפולה של effects במצב-פיתוח דורסת אותה
  useEffect(() => {
    if (!ready) return
    const q = new URLSearchParams(window.location.search)
    q.set('tab', tab)
    if (tab === 'review') q.set('sec', sec)
    else q.delete('sec')
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`)
  }, [ready, tab, sec])

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getJson('/summary'))
    } catch {
      /* המונים אינם חוסמים את המסך */
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    loadSummary()
  }, [loadSummary])
  // יש עוד נתונים מהדף הישן? (אותה בקשה שהלשונית עצמה שולחת). שגיאה — הלשונית נשארת
  useEffect(() => {
    getJson('/legacy').then((data) => setLegacyEmpty(legacyTotal(data) === 0)).catch(() => {})
  }, [])

  const tabs = proofTabItems(summary, { hideLegacy: legacyEmpty, active: tab })
  const phoneMenu = tabs.filter((t) => t.hideOnPhone).map((t) => ({ id: t.id, icon: t.icon, label: t.label, onSelect: () => setTab(t.id) }))

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        title="הגהה"
        description={(
          <>
            מתנדבים מגיהים את מה שהמודלים זיהו, ושום דבר לא חוזר למחשב האימון בלי שאושר כאן. שלושה מודלים: זיהוי טקסט
            (קורא את המילים), נתב הכתב (מזהה אם השורה בכתב מרובע או רש״י) וגלאי אזורים (מסמן את חלקי העמוד).{' '}
            <Link href="/library/page-proof" prefetch={false} className="text-primary underline underline-offset-2">הדף של המתנדבים</Link>
          </>
        )}
        action={<MenuButton label="עוד לשוניות" items={phoneMenu} className="sm:hidden" />}
      />
      <Counters summary={summary} />
      <Tabs label="מסכי ההגהה" idPrefix="proof" items={tabs} value={tab} onChange={setTab} className="border-b border-outline-variant" />
      {ready && (
        <div {...tabPanelProps('proof', tab)} className="min-w-0 outline-none">
          {tab === 'review' && <ReviewTab section={sec} setSection={setSec} summary={summary} onChanged={loadSummary} />}
          {tab === 'upload' && <UploadTab onChanged={loadSummary} />}
          {tab === 'export' && <ExportTab onChanged={loadSummary} />}
          {tab === 'volunteers' && <VolunteersTab onChanged={loadSummary} />}
          {tab === 'guide' && <GuideTab />}
          {tab === 'legacy' && (
            <>
              <p className="mb-4 text-body-md text-on-surface-variant">כאן מוחקים לצמיתות את הנתונים של הדף הישן של ההגהה — ספרים, עמודים, הגשות ותמונות. אחרי המחיקה אי אפשר לשחזר אותם.</p>
              <LegacyTab />
            </>
          )}
        </div>
      )}
    </div>
  )
}

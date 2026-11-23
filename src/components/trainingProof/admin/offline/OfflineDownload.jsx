'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import CheckRow from '@/components/ui/CheckRow'
import ErrorNotice from '@/components/ui/ErrorNotice'
import { getJson, fmt } from '../api'
import { Muted } from '../bits'
import { downloadLinks } from './offlineLinks'

// ההורדה: "הכן הורדה" שואל את השרת מה ממתין ואיך זה מתחלק לקבצים, ואז קישור לכל קובץ.
// הקישור הוא GET רגיל — הדפדפן מוריד ישר לתיקיית ההורדות, והאתר לא משתנה בכלל.
export default function OfflineDownload({ section }) {
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ctx, setCtx] = useState(true)
  const [planFor, setPlanFor] = useState(section)
  if (planFor !== section) {
    setPlanFor(section)
    setPlan(null)
    setErr('')
  }

  const prepare = async () => {
    setBusy(true)
    setErr('')
    try {
      setPlan(await getJson(`/offline/download/${section}?plan=1`))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const links = downloadLinks(section, plan, { ctx })
  const unit = section === 'frames' ? 'עמודים' : 'שורות'
  return (
    <div className="flex flex-col gap-2">
      {section !== 'frames' && (
        <CheckRow checked={ctx} onChange={setCtx} className="text-body-sm">
          כולל &quot;העמוד המלא&quot; לכל שורה (הקובץ גדול יותר)
        </CheckRow>
      )}
      <Button variant="tonal" size="sm" icon="download" className="self-start" loading={busy} onClick={prepare}>
        {plan ? 'רענן את רשימת הקבצים' : 'הכן הורדה'}
      </Button>
      <ErrorNotice text={err} />
      {plan && !plan.count && <Muted>אין כרגע מה שממתין לאישור בחלק הזה.</Muted>}
      {plan && plan.count > 0 && (
        <>
          <Muted>
            {fmt(plan.count)} {unit} ממתינים — {section === 'frames' ? `${fmt(links.length)} ספרים, קובץ לכל ספר` : links.length === 1 ? 'קובץ אחד' : `${fmt(links.length)} קבצים, עד ${fmt(plan.per)} שורות בקובץ`}.
            לחיצה מורידה את הקובץ; פותחים אותו בדפדפן (לחיצה כפולה), גם בלי אינטרנט.
          </Muted>
          <ul className="flex flex-wrap gap-2" data-testid="tp-offline-links">
            {links.map((l) => (
              <li key={l.key}>
                <Button variant="text" size="sm" icon="download" href={l.href}>
                  {l.label} ({fmt(l.count)})
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

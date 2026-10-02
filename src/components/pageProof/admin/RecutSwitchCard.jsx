'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import { seenAgoLabel } from '@/lib/pageProof/recutRules'

// "שליחת מתנדבים לזיהוי-מחדש" — מתג המנהל לכפתור "שלח לזיהוי-מחדש" של המתנדבים
// (api/admin/page-proof/settings; הכללים — recutRules.recutEffective). הזיהוי-מחדש רץ בתוכנת-הספר
// אצל בעל הפרויקט, רק כשהיא פתוחה — כשהיא סגורה, בקשות ממתינות באתר. שלושה מצבים: פועל · כבוי ·
// אוטומטי (רק כשתוכנת-הספר מחוברת). כיבוי אינו מבטל בקשות שכבר ממתינות; "החזר את כל הממתינים
// למתנדבים" — POST recut-requests/release (בקשה שכבר נמשכה לתוכנה נשארת).

const MODES = [
  { key: 'on', he: 'פועל', title: 'הכפתור "שלח לזיהוי-מחדש" מופיע למתנדבים תמיד' },
  { key: 'off', he: 'כבוי', title: 'הכפתור אינו מופיע; תיקוני-חיתוך עוברים בהגשה הרגילה, אחרי אישורכם' },
  { key: 'auto', he: 'אוטומטי', title: 'הכפתור מופיע רק כשתוכנת-הספר נראתה מחוברת בדקות האחרונות' },
]

export default function RecutSwitchCard() {
  const { showAlert, showConfirm } = useDialog()
  // {settings, effective, bookSoftwareSeenAt, pendingRecut} | null (נטען)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/page-proof/settings', { cache: 'no-store' }).catch(() => null)
    const d = await res?.json().catch(() => null)
    if (res?.ok && d?.success) {
      setData(d)
      setLoadError(null)
    } else setLoadError(d?.error || 'טעינת המתג נכשלה')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setMode = async (recutRequests) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/page-proof/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recutRequests }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success) throw new Error(d?.error || 'השמירה נכשלה')
      setData(d)
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  const releaseAll = () =>
    showConfirm(
      'החזרת הממתינים למתנדבים',
      'כל עמוד שמתנדב שלח לזיהוי-מחדש ועוד לא נמשך לתוכנת-הספר יחזור אל המתנדב ששלח אותו — עם הטיוטה שלו — והבקשה תבוטל. עמודים שהתוכנה כבר משכה נשארים: הם יחזרו בגרסה חדשה. להמשיך?',
      async () => {
        setBusy(true)
        try {
          const res = await fetch('/api/admin/page-proof/recut-requests/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          })
          const d = await res.json().catch(() => null)
          if (!res.ok || !d?.success) throw new Error(d?.error || 'הפעולה נכשלה')
          showAlert('בוצע', `${d.released === 1 ? 'עמוד אחד חזר' : `${d.released} עמודים חזרו`} למתנדבים.${d.picked ? ` ${d.picked} כבר בתוכנת-הספר ונשארו.` : ''}`)
          await load()
        } catch (e) {
          showAlert('שגיאה', e.message)
        } finally {
          setBusy(false)
        }
      },
      'החזר',
      'חזרה'
    )

  const mode = data?.settings?.recutRequests
  const waiting = data?.pendingRecut?.waiting || 0
  const picked = data?.pendingRecut?.picked || 0

  return (
    <div className="glass-strong rounded-xl p-4" data-testid="recut-switch-card">
      <h3 className="mb-2 flex items-center gap-2 font-bold text-on-surface">
        <span className="material-symbols-outlined text-primary">cached</span>
        שליחת מתנדבים לזיהוי-מחדש
      </h3>
      <p className="mb-3 text-sm text-on-surface/60">
        הכפתור &quot;שלח לזיהוי-מחדש&quot; מאפשר למתנדב שתיקן חיתוך לשלוח את העמוד בעצמו. הזיהוי-מחדש רץ בתוכנת-הספר במחשב של בעל
        הפרויקט, רק כשהיא פתוחה — כשהיא סגורה הבקשות ממתינות כאן. כיבוי אינו מבטל בקשות שכבר ממתינות.
      </p>

      {loadError && <p className="mb-2 rounded bg-danger-50 px-2 py-1 text-sm text-danger-700">{loadError}</p>}
      {data && (
        <>
          <div role="radiogroup" aria-label="שליחת מתנדבים לזיהוי-מחדש" className="inline-flex overflow-hidden rounded-lg border border-surface-variant">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mode === m.key}
                title={m.title}
                disabled={busy}
                onClick={() => mode !== m.key && setMode(m.key)}
                className={`px-4 py-1.5 text-sm transition-colors disabled:opacity-40 ${mode === m.key ? 'bg-primary font-bold text-on-primary' : 'bg-white text-on-surface hover:bg-surface-variant/60'}`}
              >
                {m.he}
              </button>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-sm text-on-surface/80">
            <li data-testid="recut-effective">
              עכשיו:{' '}
              <b className={data.effective?.recutRequests ? 'text-success-700' : 'text-warning-800'}>
                {data.effective?.recutRequests ? 'הכפתור מופיע למתנדבים' : 'הכפתור אינו מופיע למתנדבים'}
              </b>
              {mode === 'auto' && ` (אוטומטי — לפי ${data.settings.autoMinutes} הדקות האחרונות)`}
            </li>
            <li>תוכנת-הספר נראתה לאחרונה: {seenAgoLabel(data.bookSoftwareSeenAt)}</li>
            <li data-testid="recut-waiting">
              ממתינים עכשיו: {waiting === 1 ? 'עמוד אחד' : `${waiting} עמודים`}
              {picked > 0 && ` (ועוד ${picked} שכבר בתוכנת-הספר)`}
            </li>
          </ul>
          <button
            type="button"
            onClick={releaseAll}
            disabled={busy || waiting === 0}
            title="כל עמוד שמתנדב שלח ועוד לא נמשך לתוכנת-הספר — חוזר אליו, עם הטיוטה שלו"
            className="mt-3 rounded-lg border border-surface-variant bg-white px-3 py-1.5 text-sm hover:bg-surface-variant/60 disabled:opacity-40"
          >
            החזר את כל הממתינים למתנדבים
          </button>
        </>
      )}
    </div>
  )
}

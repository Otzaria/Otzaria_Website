'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { canConfigureCorrections } from '@/lib/roles'

const PROBLEMS = {
  worker_not_running: 'ה-worker לא דופק לאחרונה ויש עבודה ממתינה — התור אינו מעובד',
  worker_paused: 'ה-worker מושהה (שבת) ויש עבודה ממתינה — התור ימשיך בצאת השבת',
  worker_last_batch_error: 'האצווה האחרונה של ה-worker נכשלה',
  publish_unknown_pending: 'יש ניסיונות פרסום בתוצאה לא ידועה (ממתינים ל-reconciliation)',
  config_errors: 'יש שגיאות בהגדרות',
  legacy_not_migrated: 'יש דיווחים ישנים שלא עברו migration ואינם מוצגים — יש להריץ scripts/migrate-corrections.mjs --apply',
}
const COUNTS = {
  open: 'פתוחים', legacyNotMigrated: 'ישנים שלא עברו migration', manualQueued: 'בתור הידני', claimed: 'בטיפול',
  verifyQueued: 'בבדיקה אוטומטית', outboxPending: 'ממתינים ל-worker', publishReady: 'מאושרים לפרסום',
  publishUnknown: 'פרסום לא ידוע', publishFailed: 'פרסום נכשל', prOpened: 'PR פתוחים', emailOnly: 'מייל בלבד (לא לאוצריא)',
}
const PUBLISH_MODE_OPTIONS = [
  { value: 'disabled', label: 'כבוי' },
  { value: 'pr', label: 'פתיחת PR' },
  { value: 'direct', label: 'קומיט ישיר' },
]
const AUTO_PUBLISH_CONFIRM = 'בפרסום אוטומטי תיקון שעבר את שירות הבדיקה מתפרסם בלי שאף מתנדב ראה אותו. להמשיך?'
const DIRECT_CONFIRM = 'במצב "קומיט ישיר" כל תיקון שמאושר נכתב ישירות לענף בספרייה — בלי PR ובלי בדיקה אנושית נוספת. להמשיך?'

function Choice({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg border text-sm ${o.value === value ? 'bg-primary text-on-primary border-primary' : 'bg-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const fmtAge = (s) => (s === null || s === undefined ? '—' : s < 120 ? `${s} שניות` : s < 7200 ? `${Math.round(s / 60)} דקות` : `${Math.round(s / 3600)} שעות`)

export default function CorrectionsAdminPage() {
  const { data: session } = useSession()
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [users, setUsers] = useState([])
  const [msg, setMsg] = useState(null)

  const loadHealth = useCallback(async () => {
    const res = await fetch('/api/corrections/admin/health', { cache: 'no-store' })
    const b = await res.json()
    if (!res.ok) setError(res.status === 403 ? 'אין הרשאה' : b.error)
    else setHealth(b)
  }, [])
  const loadUsers = useCallback(async (query) => {
    const res = await fetch(`/api/corrections/admin/volunteers?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
    const b = await res.json()
    if (res.ok) setUsers(b.users)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { loadHealth(); loadUsers('') }, 0)
    return () => clearTimeout(t)
  }, [loadHealth, loadUsers])

  const post = async (url, body) => {
    setMsg(null)
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const b = await res.json()
    if (!res.ok) setMsg(b.error || 'שגיאה')
    return res.ok
  }

  const save = async (patch) => { if (await post('/api/corrections/admin/settings', patch)) loadHealth() }
  // מעבר לקומיט ישיר בלבד דורש אישור מפורש — הוא עוקף את מסלול ה-PR.
  const changePublishMode = async (mode) => {
    if (mode !== 'direct') return save({ publishMode: mode })
    if (!window.confirm(DIRECT_CONFIRM)) return
    await save({ publishMode: mode, confirm: true })
  }
  const changeAutoPublish = async (value) => {
    if (value && !window.confirm(AUTO_PUBLISH_CONFIRM)) return
    await save(value ? { autoPublish: true, confirm: true } : { autoPublish: false })
  }

  if (error) return <div className="bg-danger-50 text-danger-700 border border-danger-200 rounded-lg p-4">{error}</div>
  if (!health) return <LoadingSpinner />
  const cfg = health.config
  const canConfigure = canConfigureCorrections(session?.user)

  return (
    <div className="space-y-4">
      {msg && <div className="bg-danger-50 text-danger-700 border border-danger-200 rounded-lg p-3">{msg}</div>}

      <section className={`rounded-xl p-4 border ${health.healthy ? 'bg-success-50 border-success-200' : 'bg-danger-50 border-danger-200'}`}>
        <h2 className="font-bold text-lg">{health.healthy ? 'המערכת תקינה' : 'נדרשת תשומת לב'}</h2>
        <ul className="text-sm mt-1 list-disc pr-5">{health.problems.map((p) => <li key={p}>{PROBLEMS[p] || p}</li>)}</ul>
        <div className="text-sm mt-2 grid gap-1 md:grid-cols-3">
          <div>דופק אחרון: {health.heartbeat ? `${fmtAge(health.heartbeat.ageSeconds)} (${health.heartbeat.workerId})` : 'אין'}</div>
          <div>משימת בדיקה ותיקה: {fmtAge(health.oldestJob.verify?.ageSeconds)}</div>
          <div>משימת פרסום ותיקה: {fmtAge(health.oldestJob.publish?.ageSeconds)}</div>
        </div>
        {health.heartbeat?.lastBatch?.paused === 'shabbat' && <p className="text-sm mt-1">ה-worker מושהה בשבת/יו&quot;ט.</p>}
      </section>

      <section className="glass rounded-xl p-4">
        <h2 className="font-bold mb-2">ספירות</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          {Object.entries(health.counts).map(([k, v]) => <div key={k} className="rounded-lg bg-white border p-2"><div className="text-on-surface/60">{COUNTS[k] || k}</div><div className="text-xl font-bold">{v}</div></div>)}
        </div>
      </section>

      <section className="glass rounded-xl p-4 space-y-2 text-sm">
        <h2 className="font-bold text-base">הגדרות שירות הבדיקה (מוגדרות בשרת, לקריאה בלבד)</h2>
        <div>שירות הבדיקה: <b>{cfg.verify.enabled ? `פעיל (${cfg.verify.urlHost})` : `כבוי — ${cfg.verify.disabledReason}`}</b>{cfg.verify.isMock ? ' · שרת דמה' : ''}</div>
        <div>סמכות השירות: <b>{cfg.verify.authority}</b> · היקף מבוקש: <b>{cfg.verify.requestedScope}</b> · דחייה אוטומטית: <b>{cfg.verify.autoRejectAllowed ? 'מותרת' : 'לא'}</b></div>
        <div>יעד הפרסום: <span dir="ltr">{cfg.publish.repo}@{cfg.publish.branch}</span> · טוקן: <b>{cfg.publish.tokenConfigured ? 'מוגדר' : 'חסר'}</b></div>
        <div>מקור לקריאה: <span dir="ltr">{cfg.source.repo}@{cfg.source.ref}</span></div>
        {cfg.errors.length > 0 && <ul className="text-danger-700 list-disc pr-5">{cfg.errors.map((e) => <li key={e} dir="ltr">{e}</li>)}</ul>}
      </section>

      <section className="glass rounded-xl p-4 space-y-3 text-sm">
        <h2 className="font-bold text-base">מתגי המערכת</h2>
        {!canConfigure && <p className="text-xs text-on-surface/60">לקריאה בלבד — שינוי המתגים מותר למנהל כללי.</p>}

        <div className="flex flex-wrap items-center gap-3">
          <span className="w-44">קבלת דיווחים מהתוכנה:</span>
          {canConfigure
            ? <Choice options={[{ value: true, label: 'פעילה' }, { value: false, label: 'כבויה' }]} value={cfg.intakeEnabled} onChange={(v) => save({ intakeEnabled: v })} />
            : <b>{cfg.intakeEnabled ? 'פעילה' : 'כבויה'}</b>}
          <span className="text-xs text-on-surface/60">כבויה: הדיווחים נדחים ב-503 והתוכנה שומרת אותם בתור שלה.</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="w-44">מצב פרסום:</span>
          {canConfigure
            ? <Choice options={PUBLISH_MODE_OPTIONS} value={cfg.publish.requestedMode} onChange={changePublishMode} />
            : <b>{cfg.publish.requestedMode}</b>}
          {cfg.publish.disabledReason && cfg.publish.disabledReason !== 'publish_disabled' && <span className="text-danger-700">({cfg.publish.disabledReason})</span>}
          <span className="text-danger-700 text-xs">&quot;קומיט ישיר&quot; כותב לענף בלי PR ובלי בדיקה אנושית נוספת — מסוכן.</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="w-44">פרסום אוטומטי:</span>
          {canConfigure
            ? <Choice options={[{ value: true, label: 'מופעל' }, { value: false, label: 'כבוי' }]} value={cfg.autoPublish} onChange={changeAutoPublish} />
            : <b>{cfg.autoPublish ? 'מופעל' : 'כבוי'}</b>}
          <span className="text-xs text-on-surface/60">פרסום בלי מתנדב, רק אחרי אישור מלא של שירות הבדיקה.</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="w-44">שירות הבדיקה:</span>
          {canConfigure
            ? <Choice options={[{ value: false, label: 'פעיל' }, { value: true, label: 'מושהה' }]} value={cfg.verifyPaused} onChange={(v) => save({ verifyPaused: v })} />
            : <b>{cfg.verifyPaused ? 'מושהה' : 'פעיל'}</b>}
          <span className="text-xs text-on-surface/60">בהשהיה הדיווחים הממתינים עוברים לתור הידני.</span>
        </div>
      </section>

      <section className="glass rounded-xl p-4 space-y-3">
        <h2 className="font-bold">מתנדבי תיקונים</h2>
        <p className="text-xs text-on-surface/60">הרשאת טיפול ואישור בלבד — אינה מעניקה גישה לניהול המערכת. מנהל כללי ומנהל ספרים מורשים אוטומטית.</p>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או אימייל" className="flex-1 border rounded-lg px-2 py-1 bg-white" />
          <button onClick={() => loadUsers(q)} className="px-3 py-1 rounded-lg glass">חיפוש</button>
        </div>
        <ul className="divide-y">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2 text-sm">
              <span>{u.name} <span className="text-on-surface/50">({u.role})</span></span>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={u.volunteer}
                  onChange={async (e) => { if (await post('/api/corrections/admin/volunteers', { userId: u.id, isCorrectionsVolunteer: e.target.checked })) loadUsers(q) }}
                />
                מתנדב
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

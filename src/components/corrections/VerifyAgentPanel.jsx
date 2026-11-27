'use client'

import { HANDOFF_REASON_LABELS } from '@/lib/corrections/states'

// שירות הבדיקה בדף "ניהול ובריאות": אופן ההעברה (דחיפה/משיכה), "נראה לאחרונה" של הסוכן במשיכה,
// ומשימות הבדיקה לפי מצב (health.verifyAgent — src/lib/corrections/agent.js).
const TRANSPORT = {
  push: 'דחיפה — האתר פונה לשירות הבדיקה',
  pull: 'משיכה — שירות הבדיקה מושך משימות מהאתר',
}
const JOBS = {
  pending: 'ממתינות',
  leased: 'בבדיקה אצל השירות',
  leaseExpired: 'מהן שה-lease שלהן פג',
  done: 'הסתיימו',
  failed: 'נכשלו',
  cancelled: 'בוטלו',
}

export default function VerifyAgentPanel({ verifyAgent, fmtAge }) {
  if (!verifyAgent) return null
  const { transport, agent, jobs, enabled, disabledReason } = verifyAgent
  // שרת ישן בלי השדה — כאילו פעיל. כבוי: "כבוי", ולא תיאור של אופן העברה שאינו בשימוש.
  const off = enabled === false
  const reason = off && disabledReason && disabledReason !== 'service_disabled' ? HANDOFF_REASON_LABELS[disabledReason] || disabledReason : null
  return (
    <section className="glass rounded-xl p-4 space-y-2 text-sm">
      <h2 className="font-bold text-base">שירות הבדיקה — העברה ומשימות</h2>
      {off
        ? <div>שירות הבדיקה: <b>כבוי</b>{reason ? ` (${reason})` : ''}</div>
        : <div>אופן ההעברה: <b>{TRANSPORT[transport] || transport}</b></div>}
      {agent && (
        <div>
          סוכן: <b dir="ltr">{agent.agentId || '—'}</b>
          {agent.version && <> · גרסה <span dir="ltr">{agent.version}</span></>}
          {' · '}נראה לאחרונה:{' '}
          <b className={agent.stale ? 'text-danger-700' : ''}>{agent.lastSeenAt ? `לפני ${fmtAge(agent.ageSeconds)}` : 'מעולם לא'}</b>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {Object.entries(JOBS).map(([key, label]) => (
          <div key={key} className="rounded-lg bg-white border p-2">
            <div className="text-on-surface/60">{label}</div>
            <div className="text-lg font-bold">{jobs?.[key] ?? 0}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

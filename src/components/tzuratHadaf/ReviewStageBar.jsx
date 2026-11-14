'use client'

import { STAGES } from './labels'

// הפס של שלבי בדיקת העמוד (כמו StageBar של הגהת העמודים): ארבעת השלבים — אפשר לעבור ביניהם בחופשיות —
// מה עושים בשלב הנוכחי, ומצב השמירה בשרת.

const DRAFT_TEXT = {
  idle: '',
  pending: 'יש שינויים שעוד לא נשמרו',
  saving: 'שומר...',
  saved: 'נשמר בשרת',
  error: 'השמירה נכשלה — ננסה שוב',
  stale: 'הטיוטה נשמרה בינתיים במקום אחר — טענו את הדף מחדש',
  lost: 'העמוד כבר אינו בידיכם — השינויים לא נשמרים',
}

export function DraftStatus({ status }) {
  const s = status?.state || 'idle'
  if (s === 'idle') return null
  const bad = s === 'error' || s === 'stale' || s === 'lost'
  return (
    <span role="status" className={`flex items-center gap-1 text-xs ${bad ? 'font-bold text-danger-700' : 'text-on-surface/60'}`} data-testid="draft-status" data-state={s}>
      <span aria-hidden="true" className="material-symbols-outlined text-sm">{bad ? 'sync_problem' : s === 'saved' ? 'cloud_sync' : 'pending'}</span>
      {DRAFT_TEXT[s]}
    </span>
  )
}

export default function ReviewStageBar({ stage, onStage, status = null, children = null }) {
  const cur = STAGES.find((s) => s.key === stage) || STAGES[0]
  return (
    <div className="glass-strong sticky top-2 z-20 flex flex-col gap-2 rounded-xl px-3 py-2" data-testid="stage-bar" data-stage={stage}>
      <div className="flex flex-wrap items-center gap-2">
        <ol className="flex flex-wrap items-center gap-1" aria-label="שלבי הבדיקה">
          {STAGES.map((s, i) => {
            const on = s.key === stage
            return (
              <li key={s.key} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden="true" className="text-on-surface/40">
                    ‹
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onStage(s.key)}
                  aria-current={on ? 'step' : undefined}
                  className={`flex min-h-9 items-center gap-1 rounded-full px-3 text-sm ${on ? 'bg-primary font-bold text-on-primary' : 'bg-surface-variant/60 text-on-surface/70 hover:bg-surface-variant'}`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-base">{s.icon}</span>
                  {i + 1}. {s.label}
                </button>
              </li>
            )
          })}
        </ol>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <DraftStatus status={status} />
          {children}
        </div>
      </div>
      <p className="text-sm text-on-surface/70">{cur.text}</p>
    </div>
  )
}

'use client'

import DraftStatus from './DraftStatus'
import { STAGE_HE, STAGE_TEXT } from '@/lib/pageProof/stages'

// הפס שמעל העורך בדף המתנדב (docs/63 §3): שני השלבים — "1 מבנה › 2 טקסט" (הנוכחי מודגש), מה עושים בשלב הזה, ומעבר:
// בשלב "מבנה" — "דלג — המבנה נכון" (לחיצה אחת, קיים תמיד); בשלב "טקסט" — "חזרה לשלב המבנה" (הטקסט שתוקן נשאר).
// בקצה — "נשמר / לא נשמר בשרת" (DraftStatus). note — הודעה על המעבר האחרון (למשל: השורות שנחתכו נעולות עד ההגשה).

const STEPS = [
  { key: 'structure', icon: 'account_tree' },
  { key: 'text', icon: 'text_fields' },
]

export default function StageBar({ stage, status, onSkip, onBack, busy = false, note = null, onCloseNote, onReload = null }) {
  return (
    <div className="flex flex-col gap-1" data-testid="stage-bar" data-stage={stage}>
      <div className="glass-strong flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm">
        <ol className="flex items-center gap-1" aria-label="שלבי ההגהה">
          {STEPS.map((s, i) => {
            const on = s.key === stage
            return (
              <li key={s.key} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden="true" className="text-on-surface/40">
                    ‹
                  </span>
                )}
                <span
                  aria-current={on ? 'step' : undefined}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 ${on ? 'bg-primary font-bold text-on-primary' : 'bg-surface-variant/60 text-on-surface/60'}`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-base">{s.icon}</span>
                  {i + 1}. {STAGE_HE[s.key]}
                </span>
              </li>
            )
          })}
        </ol>
        <span className="min-w-[12rem] flex-1 text-on-surface/70">{STAGE_TEXT[stage]}</span>
        {stage === 'structure' && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            title={STAGE_TEXT.skipTitle}
            className="flex items-center gap-1 rounded-lg border border-surface-variant bg-white px-3 py-1 text-xs font-bold text-on-surface/80 hover:bg-surface-variant/60 disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-sm">skip_next</span>
            {STAGE_TEXT.skip}
          </button>
        )}
        {stage === 'text' && onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            title={STAGE_TEXT.backTitle}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-on-surface/70 hover:bg-surface-variant/60 disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-sm">arrow_forward</span>
            {STAGE_TEXT.back}
          </button>
        )}
        <DraftStatus status={status} onReload={onReload} />
      </div>
      {note && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-800" data-testid="stage-note">
          <span aria-hidden="true" className="material-symbols-outlined">info</span>
          <p className="flex-1">{note}</p>
          {onCloseNote && (
            <button type="button" onClick={onCloseNote} aria-label="סגירת ההודעה" className="rounded-full p-1 hover:bg-warning-100">
              <span aria-hidden="true" className="material-symbols-outlined block text-base">close</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

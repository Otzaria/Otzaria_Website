'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { pageAction } from './gridLogic'
import { num, pageStateUi, reviewPath } from './labels'

// כרטיס עמוד ברשת המסכת: הדף, המצב, כמה שאלות נוסח ממתינות, והפעולה (לקחת / להמשיך / לצפות).
// onClaim(page) — "קח את העמוד"; busy — בקשה בדרך.
export default function PageCard({ page, heldCount, maxHeld, onClaim, busy = false }) {
  const ui = pageStateUi(page.state)
  const act = pageAction(page.state, heldCount, maxHeld)
  const goOn = act.kind === 'resume'
  return (
    <li className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${ui.cls}`} data-testid="page-card" data-state={page.state}>
      <div className="flex items-start justify-between gap-1">
        <span className="font-frank text-2xl font-bold text-on-surface">{page.daf}</span>
        {page.pendingCount > 0 && (
          <Badge tone="warning" icon="quiz">
            <span title="שאלות נוסח שממתינות בעמוד">{num(page.pendingCount)}</span>
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge tone={ui.tone} icon={ui.icon}>
          {ui.label}
        </Badge>
        {page.round > 1 && <Badge>סבב {num(page.round)}</Badge>}
        {page.nonVilna && <Badge tone="info">לא וילנא</Badge>}
      </div>
      {act.kind === 'claim' && (
        <button
          type="button"
          onClick={() => onClaim(page)}
          disabled={act.disabled || busy}
          title={act.reason || undefined}
          className="mt-auto flex min-h-10 items-center justify-center gap-1 rounded-lg bg-primary px-2 text-sm font-bold text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">lock_open</span>
          קח את העמוד
        </button>
      )}
      {(act.kind === 'resume' || act.kind === 'view') && (
        <Link
          href={reviewPath(page.id)}
          prefetch={false}
          title={act.reason || undefined}
          className={`mt-auto flex min-h-10 items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold ${
            goOn ? 'bg-info-600 text-white hover:bg-info-700' : 'border border-outline-variant bg-surface text-on-surface hover:bg-surface-variant'
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">{goOn ? 'edit' : 'visibility'}</span>
          {goOn ? 'המשך לבדוק' : 'צפייה'}
        </Link>
      )}
      {act.kind === 'none' && <p className="mt-auto text-center text-xs text-on-surface/60">{act.reason}</p>}
    </li>
  )
}

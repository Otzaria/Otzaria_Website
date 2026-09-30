'use client'

import ProofPageThumb from '../books/ProofPageThumb'
import { ADMIN_STATE_UI } from '@/lib/pageProof/adminGrid'
import { formatUntil } from '@/lib/pageProof/dates'

// כרטיס עמוד ברשת-העמודים של המנהל (AdminBookPages): אותה תמונה ממוזערת כמו
// אצל המתנדב (ProofPageThumb), המצב בעיני המנהל, מי מחזיק ועד מתי, המתג
// "פתוח למתנדבים", ושחרור התפיסה (onRelease — אחרי אישור, ב-AdminBookPages).
// page: {id, page, revision, state, volunteer, holder, leasedUntil, lease, pending}

export default function AdminPageCard({ page, busy = false, now, onToggle, onRelease, onPreview }) {
  const ui = ADMIN_STATE_UI[page.state] || ADMIN_STATE_UI.open
  const until = page.lease === 'active' ? formatUntil(page.leasedUntil, now) : ''
  const closed = !page.volunteer
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border-2 glass transition-all ${
        closed ? 'border-dashed border-on-surface/30' : 'border-surface-variant hover:border-primary/50'
      }`}
    >
      <ProofPageThumb page={page} onPreview={onPreview}>
        {closed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-black/70 py-1 text-center text-[11px] font-bold text-white">
            סגור למתנדבים
          </div>
        )}
      </ProofPageThumb>

      <div className="flex flex-1 flex-col gap-1 p-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-sm font-bold text-on-surface">עמוד {page.page}</span>
          <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-bold ${ui.bgColor} ${ui.color} ${ui.borderColor}`} title={ui.label}>
            {ui.label}
          </span>
        </div>
        {page.holder && (
          <p className="text-xs text-on-surface/70">
            {page.lease === 'active' ? `ע"י ${page.holder}` : `התפיסה של ${page.holder} פגה`}
            {until && <span className="block text-[10px] text-on-surface/50">שמור עד {until}</span>}
          </p>
        )}
        {page.pending > 0 && page.state !== 'submitted' && (
          <p className="text-[11px] text-warning-alt-800">{page.pending === 1 ? 'הגשה אחת ממתינה לאישור' : `${page.pending} הגשות ממתינות לאישור`}</p>
        )}

        <div className="mt-auto flex flex-col gap-1 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface/80">
            <input
              type="checkbox"
              checked={!closed}
              disabled={busy}
              onChange={(e) => onToggle?.(page, e.target.checked)}
              aria-label={`עמוד ${page.page} פתוח למתנדבים`}
              className="h-4 w-4 accent-primary"
            />
            פתוח למתנדבים
          </label>
          {page.holder && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRelease?.(page)}
              aria-label={`שחרור עמוד ${page.page}`}
              className="flex items-center justify-center gap-1 rounded-md bg-danger-100 px-2 py-1 text-xs font-bold text-danger-700 transition-colors hover:bg-danger-200 disabled:opacity-50"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-sm">lock_open</span>
              שחרור
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

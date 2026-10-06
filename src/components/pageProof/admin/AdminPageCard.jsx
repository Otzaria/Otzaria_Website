'use client'

import ProofPageThumb from '../books/ProofPageThumb'
import { ADMIN_STATE_UI, EXPIRED_NOTE } from '@/lib/pageProof/adminGrid'
import { formatTimeAgo, formatUntil } from '@/lib/pageProof/dates'

// כרטיס עמוד ברשת-העמודים של המנהל (AdminBookPages): אותה תמונה ממוזערת כמו
// אצל המתנדב (ProofPageThumb), המצב בעיני המנהל, מי מחזיק ועד מתי, המתג
// "פתוח למתנדבים", ושחרור התפיסה (onRelease — אחרי אישור, ב-AdminBookPages) — רק לתפיסה בתוקף: עמוד שתפיסתו פגה
// כבר פנוי לכל מתנדב מעצמו, והטיוטה שלא הוגשה עוברת איתו (serverDrafts.js) — אין מה לשחרר.
// עמוד שממתין לזיהוי-מחדש בבקשת מתנדב — מי ביקש ומתי, והאם תוכנת-הספר כבר משכה את
// הבקשה, עם "ביטול הבקשה" (onCancelRecut — העמוד חוזר אל המתנדב).
// עמוד מאושר — "פתח מחדש לעריכה" (onReopen — רק מנהל, docs/63 §5); עמוד שנפתח מחדש — מסומן (reopened).
// page: {id, page, revision, state, volunteer, holder, leasedUntil, lease, pending, recutRequest, reopened}

export default function AdminPageCard({ page, busy = false, now, onToggle, onRelease, onCancelRecut, onReopen, onPreview }) {
  const ui = ADMIN_STATE_UI[page.state] || ADMIN_STATE_UI.open
  const until = page.lease === 'active' ? formatUntil(page.leasedUntil, now) : ''
  const closed = !page.volunteer
  const req = page.recutRequest
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
            {page.lease === 'expired' && (
              <span className="block text-[10px] text-on-surface/50">
                {EXPIRED_NOTE}
              </span>
            )}
            {until && <span className="block text-[10px] text-on-surface/50">שמור עד {until}</span>}
          </p>
        )}
        {req && (
          <p className="text-xs text-feature-800" data-testid="recut-request">
            לבקשת {req.by || 'מתנדב'}
            {req.at && <span className="text-on-surface/50"> · {formatTimeAgo(req.at, now || new Date())}</span>}
            <span className="block text-[10px] text-on-surface/50">{req.picked ? 'תוכנת-הספר משכה את הבקשה' : 'ממתין לתוכנת-הספר'}</span>
          </p>
        )}
        {page.reopened && page.state !== 'approved' && (
          <p className="text-[11px] text-info-800" data-testid="reopened">
            נפתח מחדש לעריכה
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
          {req && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancelRecut?.(page)}
              aria-label={`ביטול הבקשה לזיהוי-מחדש של עמוד ${page.page}`}
              className="flex items-center justify-center gap-1 rounded-md bg-feature-100 px-2 py-1 text-xs font-bold text-feature-800 transition-colors hover:bg-feature-200 disabled:opacity-50"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-sm">undo</span>
              ביטול הבקשה
            </button>
          )}
          {page.state === 'approved' && onReopen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReopen(page)}
              aria-label={`פתיחה מחדש לעריכה של עמוד ${page.page}`}
              title="העמוד יחזור להיות פתוח למתנדבים; מי שיתפוס אותו יתחיל מהגרסה שאושרה. האישור הבא — שוב בידי מנהל"
              className="flex items-center justify-center gap-1 rounded-md bg-info-100 px-2 py-1 text-xs font-bold text-info-800 transition-colors hover:bg-info-200 disabled:opacity-50"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-sm">lock_reset</span>
              פתח מחדש לעריכה
            </button>
          )}
          {page.holder && page.lease === 'active' && (
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

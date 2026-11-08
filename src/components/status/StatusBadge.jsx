'use client'

const FALLBACK_COLOR = '#94a3b8'
// צבע מהגדרות המשתמש — רק ערך צבע פשוט (לא ביטוי CSS שרירותי)
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i

/**
 * תג מצב בצבע שהמשתמש בחר בהגדרות (מקורות פרטיים): תג רך כמו ui/Badge — רקע בגוון בהיר של הצבע וטקסט בגוון כהה שלו
 * (color-mix מול משטח / טקסט התבנית, כך שזה קריא גם בכהה וגם כשהצבע בהיר), בלי צל ובלי לבן מודגש על צבע רווי.
 * editable — כפתור עריכה ליד התג.
 */
export default function StatusBadge({ status, statuses, onEdit, editable = false }) {
  const statusConfig = statuses?.[status] || { label: status, color: FALLBACK_COLOR }
  const color = SAFE_COLOR.test(String(statusConfig.color || '')) ? statusConfig.color : FALLBACK_COLOR

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-(--radius-pill) px-2.5 py-0.5 text-label-sm font-semibold whitespace-nowrap"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 18%, var(--color-surface))`,
          color: `color-mix(in srgb, ${color} 60%, var(--color-on-surface))`,
        }}
      >
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {statusConfig.label}
      </span>
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="עריכת המצב"
          className="flex size-(--touch-target) items-center justify-center rounded-(--radius-control) text-on-surface-variant hover:bg-surface-selected"
        >
          <span className="material-symbols-outlined text-sm">edit</span>
        </button>
      )}
    </div>
  )
}

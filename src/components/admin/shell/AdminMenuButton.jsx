import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

/**
 * כפתור "ניהול" בכותרת האתר (מתחת ל-xl, שם הסרגל מוסתר) — פותח את מגירת הניהול.
 * יושב בשורה העליונה ליד כפתור התפריט של האתר (☰, אייקון בלבד), ולכן נבדל ממנו בבירור: אייקון
 * ניהול (לא ☰), שם גלוי "ניהול" — כמו כותרת המגירה שהוא פותח — ומשטח tonal.
 * המספר האדום על הכפתור הוא מספר ההודעות שלא נקראו בלבד: סכום כל התורים
 * (אלפי העלאות ממתינות) בלע הודעה חדשה. כשממתין רק משהו אחר — נקודה אדומה.
 * לקוראי מסך תמיד פירוט מלא ("ממתין לטיפולך: 3 הודעות שלא נקראו, 11 העלאות ממתינות").
 */
export default function AdminMenuButton({ attention, total, expanded, onClick, className }) {
  const summary = attention.map((item) => item.accessibleLabel).join(', ')
  const unreadMessages = attention.find((item) => item.id === 'messages')?.count ?? 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className={cx(
        'relative inline-flex min-h-(--touch-target) shrink-0 items-center gap-1.5 rounded-(--radius-control) bg-secondary-container ps-3 pe-4 text-label-lg text-on-secondary-container transition-colors hover:bg-secondary-container-hover',
        FOCUS_RING,
        className
      )}
    >
      <AppIcon name="admin_panel_settings" className="text-icon-lg" />
      <span>ניהול</span>
      {total > 0 && (
        <>
          {unreadMessages > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -end-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-(--radius-pill) bg-error px-1.5 text-label-sm tabular-nums text-on-error ring-2 ring-background"
            >
              {unreadMessages}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="absolute -end-1 -top-1 size-3 rounded-(--radius-pill) bg-error ring-2 ring-background"
            />
          )}
          <span className="sr-only">{`, ממתין לטיפולך: ${summary}`}</span>
        </>
      )}
    </button>
  )
}

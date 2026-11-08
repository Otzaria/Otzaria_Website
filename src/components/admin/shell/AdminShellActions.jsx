import Link from 'next/link'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import BackupAction from '@/components/admin/backup/BackupAction'

const ACTION = cx(
  'flex w-full min-h-(--touch-target) items-center gap-3 rounded-(--radius-control) px-3 text-label-lg font-medium text-primary transition-colors hover:bg-surface-selected',
  FOCUS_RING_INSET
)

/**
 * הפעולות שהיו בראש מסך הניהול — "הורד גיבוי" והחזרה לאזור האישי — בתחתית הסרגל/המגירה,
 * מופרדות בקו (בלי שם התפקיד — לבקשת המשתמש). "האזור האישי" כמו בתפריט החשבון שבכותרת (/library/dashboard); "לוח" בסרגל
 * הוא עמוד הבית של הניהול, ולכן לא באותו שם. "הורד גיבוי" פותח דיאלוג קצר ורק ממנו מתחילה ההורדה (BackupAction); מוצג
 * רק כש-canBackup — ההחלטה מתקבלת בשרת, ב-AdminFrame (lib/adminBackup: canDownloadBackup).
 */
export default function AdminShellActions({ canBackup, onNavigate }) {
  return (
    <div className="mt-3 flex flex-col gap-0.5 border-t border-outline-variant pt-3">
      {canBackup && (
        <BackupAction triggerClassName={ACTION} onDone={onNavigate} />
      )}
      <Link href="/library/dashboard" onClick={onNavigate} className={ACTION}>
        <AppIcon name="arrow_forward" className="shrink-0 text-icon-lg" />
        <span>חזרה לאזור האישי</span>
      </Link>
    </div>
  )
}

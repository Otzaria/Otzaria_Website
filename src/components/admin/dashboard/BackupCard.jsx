import { cardClasses } from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import BackupAction from '@/components/admin/backup/BackupAction'
import DashboardSectionHeading from './DashboardSectionHeading'

/**
 * "גיבוי" בתחתית הלוח — רק למי שרואה את "הורד גיבוי" בסרגל (lib/adminBackup: canDownloadBackup; ההחלטה בשרת, בלוח).
 * כרטיס אחד: מה זה, ו"הורד גיבוי" (אותו דיאלוג ואותה הורדה כמו בסרגל).
 */
export default function BackupCard() {
  return (
    <section aria-labelledby="dashboard-backup" className="flex flex-col gap-4">
      <DashboardSectionHeading id="dashboard-backup" title="גיבוי" />
      <div className={cardClasses({ padding: 'md', className: 'flex flex-wrap items-center gap-4' })}>
        <IconTile icon="cloud_download" />
        <p className="min-w-0 flex-1 basis-56 text-body-md text-on-surface-variant">המשתמשים והספרים של האתר בקובץ אחד, להורדה למחשב.</p>
        <BackupAction />
      </div>
    </section>
  )
}

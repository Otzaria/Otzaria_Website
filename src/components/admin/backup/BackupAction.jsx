'use client'

import { useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { startDownload } from '@/components/admin/list/adminRequest'
import { BACKUP_TEXT, BACKUP_URL } from '@/lib/adminBackup'

/**
 * "הורד גיבוי": דיאלוג קצר שמסביר מה מורידים ושזה עשוי לקחת זמן, ו"הורד גיבוי" מתחיל הורדה רגילה של הדפדפן — אותה
 * בקשה כמו קודם (GET /api/admin/export-backup). triggerClassName — מראה הכפתור הפותח (פריט בתחתית הסרגל);
 * בלי — כפתור tonal (כרטיס בלוח). onDone — אחרי ההורדה (למשל לסגור את המגירה).
 * מי רואה אותו — מי שמרנדר (lib/adminBackup: canDownloadBackup).
 */
export default function BackupAction({ triggerClassName, onDone }) {
  const [open, setOpen] = useState(false)
  const download = () => {
    setOpen(false)
    startDownload(BACKUP_URL)
    onDone?.()
  }
  return (
    <>
      {triggerClassName ? (
        <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
          <AppIcon name="download" className="shrink-0 text-icon-lg" />
          <span>הורד גיבוי</span>
        </button>
      ) : (
        <Button variant="tonal" size="sm" icon="download" onClick={() => setOpen(true)}>הורד גיבוי</Button>
      )}
      {open && (
        <ConfirmDialog
          title={BACKUP_TEXT.title}
          body="הגיבוי כולל את המשתמשים והספרים (בלי סיסמאות) בקובץ אחד. ההורדה עשויה להימשך כמה דקות."
          confirmLabel={BACKUP_TEXT.confirm}
          onConfirm={download}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}

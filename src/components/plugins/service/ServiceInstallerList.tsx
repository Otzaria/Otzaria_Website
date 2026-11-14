import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import { formatFileSize } from '@/lib/formatFileSize'
import { archLabel } from './servicePlatforms'
import type { ServicePlatformFile } from './serviceDownloadLogic'

/**
 * המתקינים של מערכת אחת — שורה לכל מעבד, עם המערכת המינימלית שהמפתח הצהיר. כשיש כמה קבצים
 * הבחירה ידנית: אין זיהוי אמין בין x64 ל-ARM64 מהדפדפן.
 */
export default function ServiceInstallerList({ files, emphasis = 'primary' }: {
  files: ServicePlatformFile[]
  emphasis?: 'primary' | 'secondary'
}) {
  if (files.length === 0) return <p className="text-body-sm text-on-surface-variant">אין מתקין למערכת זו.</p>
  return (
    <div className="flex flex-col gap-3">
      {files.length > 1 && (
        <p className="text-body-sm text-on-surface-variant">
          יש כמה קבצים למערכת זו — בחרו לפי סוג המעבד של המחשב שעליו תתקינו.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li
            key={`${file.os}-${file.arch}`}
            className="flex flex-col gap-3 rounded-(--radius-control) border border-outline-variant p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 text-body-sm">
              <p className="text-label-lg text-on-surface">מעבד: <Ltr>{archLabel(file.arch)}</Ltr></p>
              <p className="mt-0.5 text-on-surface-variant">מערכת מינימלית: <Ltr>{file.minOs}</Ltr></p>
              <p className="mt-0.5 break-all text-on-surface-variant">
                <bdi dir="ltr" className="font-mono">{file.name}</bdi> · <Ltr>{formatFileSize(file.size)}</Ltr>
              </p>
            </div>
            <Button
              href={file.downloadUrl}
              external
              variant={emphasis === 'primary' ? 'filled' : 'outlined'}
              size="sm"
              icon="download"
              className="shrink-0"
            >
              הורדת המתקין
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

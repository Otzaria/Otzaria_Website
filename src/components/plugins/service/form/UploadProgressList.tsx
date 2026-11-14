import AppIcon from '@/components/ui/AppIcon'
import Loader from '@/components/ui/Loader'
import type { UploadTaskState } from '../useServiceSubmission'

const STATE_TEXT: Record<UploadTaskState['state'], string> = {
  pending: 'ממתין',
  uploading: 'מעלה…',
  done: 'הועלה',
  error: 'נכשל'
}

const STATE_ICONS: Record<UploadTaskState['state'], string> = {
  pending: 'schedule',
  uploading: 'sync',
  done: 'check_circle',
  error: 'error'
}

/** מצב ההעלאה של כל קובץ (בזה אחר זה): ממתין / מעלה / הועלה / נכשל */
export default function UploadProgressList({ tasks }: { tasks: UploadTaskState[] }) {
  if (tasks.length === 0) return null
  return (
    <ul aria-label="העלאת הקבצים" className="flex flex-col gap-1.5 text-body-sm">
      {tasks.map((task) => (
        <li key={task.key} className="flex items-center gap-2" data-state={task.state}>
          {task.state === 'uploading'
            ? <Loader size="sm" decorative />
            : <AppIcon name={STATE_ICONS[task.state]} className="text-[1.2rem] text-on-surface-variant" />}
          <span className="min-w-0 flex-1 truncate" dir="auto">{task.label}</span>
          <span className="shrink-0 text-on-surface-variant">{STATE_TEXT[task.state]}</span>
        </li>
      ))}
    </ul>
  )
}

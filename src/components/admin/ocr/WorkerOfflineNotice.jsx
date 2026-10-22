import AppIcon from '@/components/ui/AppIcon'
import { formatLastSeen } from './ocrJobView'

/**
 * "המחשב המעבד לא זמין" — תצוגה בלבד. אינה מבטלת ואינה מכשילה דבר: העבודה נשארת בתור
 * וממשיכה כשהמחשב חוזר. ההורה מחליט מתי להציג (isWorkerUnavailable ב-ocrJobView.js).
 *
 * @param {{ worker: {configured?:boolean, lastSeenAt?:string|null}, now?: Date }} props
 */
export default function WorkerOfflineNotice({ worker, now }) {
  const notConfigured = worker?.configured === false
  return (
    <div role="status" className="flex items-start gap-2 rounded-control bg-warning-container p-3 text-sm text-on-warning-container">
      <AppIcon name="wifi_off" className="text-base" />
      <p>
        {notConfigured ? (
          <>ספק המחשב המקומי אינו מוגדר בשרת כרגע. העבודה שמורה בתור ותמשיך כשההגדרה תוחזר.</>
        ) : (
          <>
            המחשב המעבד לא זמין (נראה לאחרונה: {formatLastSeen(worker?.lastSeenAt, now)}).
            העבודה שמורה בתור ותמשיך כשיחזור.
          </>
        )}
      </p>
    </div>
  )
}

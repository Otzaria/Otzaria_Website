import AppIcon from '@/components/ui/AppIcon'
import { attentionReason } from './ocrJobView'

/**
 * "דורש טיפול במחשב המעבד" (needs_attention): תווית עברית לפי קוד הסיבה, פעולה מוצעת כשיש, ומתחת
 * ההודעה המקורית של העובד ("<reason>: <טקסט קבוע באנגלית>") לבירור מול השירות. ההודעה מוצגת כטקסט
 * רגיל בלבד (React מבצע escape), לעולם לא כ-HTML. ההורה מחליט מתי להציג (status === 'needs_attention').
 *
 * @param {{ message?: string|null }} props
 */
export default function WorkerAttentionNotice({ message }) {
  const reason = attentionReason(message)
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control bg-error-container p-3 text-sm text-on-error-container">
      <AppIcon name="warning" className="text-base" />
      <div className="min-w-0">
        <p className="font-bold">דורש טיפול במחשב המעבד</p>
        {reason && (
          <>
            <p className="mt-1 break-words">{reason.label}</p>
            {reason.action && <p className="mt-1 break-words">{reason.action}</p>}
            <p dir="ltr" className="mt-1 whitespace-pre-wrap break-words text-start font-mono text-xs opacity-80">
              {reason.detail}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

'use client'

/**
 * PR של הדיווח שנסגר בלי מיזוג: הערת הסגירה של מנהל הספרייה (להצגה בלבד — המערכת אינה מנתחת אותה),
 * מועד תום ההמתנה לקליטה ב-main, ומתי main נבדק לאחרונה. משותף למצב ההמתנה ולטיפול הידני.
 * @param {{publish:object|null|undefined, awaiting?:boolean}} props
 */
export default function PrCloseNote({ publish, awaiting = false }) {
  const comment = publish?.prCloseComment?.body
  const deadline = publish?.absorptionDeadline ? new Date(publish.absorptionDeadline) : null
  const checkedAt = publish?.absorptionCheck?.at ? new Date(publish.absorptionCheck.at) : null
  if (!comment && !(awaiting && deadline)) return null
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-variant/40 p-3 text-sm space-y-1">
      {comment && (
        <p>
          <span className="font-medium">הערת מנהל הספרייה בסגירת ה-PR: </span>
          <span className="whitespace-pre-wrap break-words">{comment}</span>
        </p>
      )}
      {awaiting && deadline && (
        <p className="text-xs text-on-surface/70">
          נבדק שוב בכל אצווה עד {deadline.toLocaleString('he-IL')}{checkedAt ? ` · נבדק לאחרונה ${checkedAt.toLocaleString('he-IL')}` : ''}
        </p>
      )}
    </div>
  )
}

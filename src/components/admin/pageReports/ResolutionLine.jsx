import RelativeTime from '@/components/ui/RelativeTime'

/**
 * מי הכריע ומתי, והערת המנהל — בדיווח שכבר הוכרע. extra — שורה נוספת (מה נעשה בטקסט העמוד).
 * @param {{ resolution?: { note?: string, byName?: string, at?: string } | null, extra?: string }} props
 */
export default function ResolutionLine({ resolution, extra }) {
  if (!resolution && !extra) return null
  return (
    <div className="flex flex-col gap-0.5 rounded-(--radius-control) bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">
      {(resolution?.byName || resolution?.at) && (
        <p className="flex flex-wrap items-center gap-x-1">
          {resolution.byName && <span>הוכרע בידי <bdi>{resolution.byName}</bdi></span>}
          {resolution.at && <RelativeTime date={resolution.at} prefix={resolution.byName ? '·' : 'הוכרע'} />}
        </p>
      )}
      {resolution?.note && <p className="text-on-surface [overflow-wrap:anywhere]"><span className="text-on-surface-variant">הערת מנהל: </span>{resolution.note}</p>}
      {extra && <p>{extra}</p>}
    </div>
  )
}

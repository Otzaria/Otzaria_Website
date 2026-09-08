'use client'

import StatusBadge from '@/components/status/StatusBadge'
import { MATCH_REASON_LABELS, RECENT_DUPLICATE_DAYS, describeDuplicate } from '@/lib/institute-outreach'
import { formatOutreachDate } from './outreachFilters'

/** שורת פנייה, עם סימון כפילות כשקיימת פנייה אחרת לאותו נמען */
export default function OutreachRow({ item, statuses, channels, duplicates, onEdit }) {
  const channelLabel = item.channel ? channels?.[item.channel]?.label || item.channel : ''
  // כפילות "חמה": פנייה קרובה בזמן או פנייה שעדיין פתוחה
  const hotDuplicate = duplicates.find((dup) => dup.isRecent || dup.isOpen)

  return (
    <div className="px-5 py-3 hover:bg-surface-variant/30 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-on-surface truncate">
              {item.contactName || item.instituteName || 'ללא שם'}
            </span>
            {item.instituteName && item.contactName && (
              <span className="text-xs text-on-surface/60 truncate">({item.instituteName})</span>
            )}
            {hotDuplicate && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-danger-100 text-danger-700 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] leading-none">warning</span>
                פנייה כפולה
              </span>
            )}
            {!hotDuplicate && duplicates.length > 0 && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-warning-100 text-warning-700">
                פנייה נוספת בעבר
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface/50 truncate mt-0.5">
            {[item.contactPhone, item.contactEmail].filter(Boolean).join(' · ') || 'ללא פרטי קשר'}
            {item.subject ? ` · ${item.subject}` : ''}
          </p>
        </div>

        <div className="md:w-40 shrink-0">
          <StatusBadge status={item.status} statuses={statuses} />
        </div>

        <div className="md:w-40 shrink-0 text-sm text-on-surface/80 truncate">
          {item.outreachBy || '—'}
        </div>

        <div className="md:w-28 shrink-0 text-sm text-on-surface/60 truncate">
          {formatOutreachDate(item.outreachDate)}
        </div>

        <div className="md:w-24 shrink-0 text-sm text-on-surface/60 truncate">
          {channelLabel || '—'}
        </div>

        <button
          onClick={onEdit}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm hover:opacity-90 flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-sm">edit</span>
          עריכה
        </button>
      </div>

      {duplicates.length > 0 && (
        <div className="mt-2 mr-1 text-xs text-on-surface/70 border-r-2 border-warning-300 pr-3 space-y-1">
          {duplicates.slice(0, 3).map((dup) => (
            <p key={dup._id}>
              גם {describeDuplicate(dup)} · {statuses?.[dup.status]?.label || dup.status} · התאמה
              לפי {MATCH_REASON_LABELS[dup.reason] || dup.reason}
            </p>
          ))}
          {duplicates.length > 3 && <p>ועוד {duplicates.length - 3} פניות…</p>}
          {hotDuplicate && (
            <p className="text-danger-700">
              פנייה חוזרת בתוך {RECENT_DUPLICATE_DAYS} ימים או בזמן שפנייה אחרת עדיין פתוחה.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import Badge from '@/components/ui/Badge'
import OpenChip from '@/components/admin/list/OpenChip'
import StatusBadge from '@/components/status/StatusBadge'
import { MATCH_REASON_LABELS, RECENT_DUPLICATE_DAYS, describeDuplicate } from '@/lib/institute-outreach'
import { formatOutreachDate } from './outreachFilters'

/**
 * שורת פנייה: הנמען (ואם יש — המכון), פרטי קשר ונושא; מצב, מי פנה, מתי ובאיזו דרך — בעמודות ברוחב קבוע; "פתח" לעריכה.
 * כשיש פנייה אחרת לאותו נמען — תג ("פנייה כפולה" כשהיא קרובה בזמן או עוד פתוחה) ופירוט מתחת.
 */
export default function OutreachRow({ item, statuses, channels, duplicates, onEdit }) {
  const channelLabel = item.channel ? channels?.[item.channel]?.label || item.channel : ''
  const hotDuplicate = duplicates.find((dup) => dup.isRecent || dup.isOpen)
  const name = item.contactName || item.instituteName || 'בלי שם'

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onEdit} className="truncate text-start text-title-sm text-on-surface underline-offset-2 hover:underline">{name}</button>
            {item.instituteName && item.contactName && <span className="truncate text-body-sm text-on-surface-variant">({item.instituteName})</span>}
            {hotDuplicate && <Badge tone="error" icon="warning">פנייה כפולה</Badge>}
            {!hotDuplicate && duplicates.length > 0 && <Badge tone="warning">פנייה נוספת בעבר</Badge>}
          </div>
          <p className="mt-0.5 truncate text-body-sm text-on-surface-variant">
            {[item.contactPhone, item.contactEmail].filter(Boolean).join(' · ') || 'בלי פרטי קשר'}
            {item.subject ? ` · ${item.subject}` : ''}
          </p>
        </div>
        <div className="shrink-0 md:w-40"><StatusBadge status={item.status} statuses={statuses} /></div>
        <div className="shrink-0 truncate text-body-sm text-on-surface md:w-36">{item.outreachBy || '—'}</div>
        <div className="shrink-0 truncate text-body-sm text-on-surface-variant md:w-24">{formatOutreachDate(item.outreachDate)}</div>
        <div className="shrink-0 truncate text-body-sm text-on-surface-variant md:w-24">{channelLabel || '—'}</div>
        <OpenChip decorative label={`פתח את הפנייה ל${name}`} onClick={onEdit} />
      </div>

      {duplicates.length > 0 && (
        <div className="flex flex-col gap-1 border-s-2 border-outline-variant ps-3 text-body-sm text-on-surface-variant">
          {duplicates.slice(0, 3).map((dup) => (
            <p key={dup._id}>
              גם {describeDuplicate(dup)} · {statuses?.[dup.status]?.label || dup.status} · התאמה לפי {MATCH_REASON_LABELS[dup.reason] || dup.reason}
            </p>
          ))}
          {duplicates.length > 3 && <p>ועוד {duplicates.length - 3} פניות…</p>}
          {hotDuplicate && <p className="text-error">פנייה חוזרת בתוך {RECENT_DUPLICATE_DAYS} ימים, או בזמן שפנייה אחרת עדיין פתוחה.</p>}
        </div>
      )}
    </li>
  )
}

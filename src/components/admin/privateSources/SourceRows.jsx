'use client'

import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import OpenChip from '@/components/admin/list/OpenChip'
import StatusBadge from '@/components/status/StatusBadge'
import { booksCount } from '@/lib/adminPrivateSourcesScreen/privateSourcesTerms'

/** סוג הקובץ (txt / docx) — תג שקט */
export function FileTypeBadge({ fileType }) {
  return <Badge><bdi dir="ltr">{fileType}</bdi></Badge>
}

/** עמודות הרשומה המשותפות לשורת ספר ולשורת סט: מצב / מי מסר / אופן האישור. ברוחב קבוע — השורות לא זזות */
export function RecordColumns({ record, options }) {
  const methodLabel = record?.permissionMethod ? options.methods?.[record.permissionMethod]?.label || record.permissionMethod : ''
  return (
    <>
      <div className="shrink-0 md:w-40">
        {record ? <StatusBadge status={record.status} statuses={options.statuses || {}} /> : <Badge tone="warning">לא תועד</Badge>}
      </div>
      <div className="shrink-0 truncate text-body-sm text-on-surface md:w-44" title={record?.ownerName || undefined}>{record?.ownerName || '—'}</div>
      <div className="shrink-0 truncate text-body-sm text-on-surface-variant md:w-28">{methodLabel || '—'}</div>
    </>
  )
}

const ROW = 'flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3'

export function BookRow({ item, options, onEdit }) {
  const record = item.record
  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onEdit} className="truncate text-start text-title-sm text-on-surface underline-offset-2 hover:underline">
            {item.bookTitle}
          </button>
          <FileTypeBadge fileType={item.fileType} />
          {record?.requireCredit && <Badge tone="info">קרדיט חובה</Badge>}
        </div>
        <p className="mt-0.5 truncate text-body-sm text-on-surface-variant" dir="auto">{item.bookPath}</p>
      </div>
      <RecordColumns record={record} options={options} />
      <OpenChip decorative label={`פתח את ${item.bookTitle}`} onClick={onEdit} />
    </li>
  )
}

/**
 * שורת סט: כמה ספרים שחולקים רשומת מקור אחת (אוטומטי לפי "X על Y" או ידני). השם פותח/סוגר את רשימת הספרים;
 * "פתח" — את רשומת המקור של הסט. ספר בסט שיש לו רשומה משלו — "רשומה נפרדת" פותח אותה.
 */
export function SetRow({ item, options, expanded, onToggle, onEdit, onEditMember }) {
  const record = item.record
  return (
    <li>
      <div className={ROW}>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex max-w-full flex-wrap items-center gap-2 text-start">
            <AppIcon name={expanded ? 'expand_less' : 'expand_more'} className="text-icon-lg text-on-surface-variant" />
            <span className="truncate text-title-sm text-on-surface">{item.setName}</span>
            <Badge tone="primary">סט</Badge>
            {item.isManual && <Badge>ידני</Badge>}
            <span className="text-body-sm text-on-surface-variant">{booksCount(item.books.length)}</span>
            {record?.requireCredit && <Badge tone="info">קרדיט חובה</Badge>}
          </button>
        </div>
        <RecordColumns record={record} options={options} />
        <OpenChip label={`פתח את פרטי המקור של הסט ${item.setName}`} onClick={onEdit} />
      </div>
      {expanded && (
        <ul className="flex flex-col gap-1 pb-3 pe-4 ps-12">
          {item.books.map((member) => (
            <li key={member.bookPath} className="flex flex-wrap items-center gap-2 text-body-sm">
              <span className="truncate text-on-surface">{member.bookTitle}</span>
              <FileTypeBadge fileType={member.fileType} />
              {member.hasOwnRecord && (
                <button type="button" onClick={() => onEditMember?.(member)} title="פרטי המקור של הספר הזה (בנפרד מהסט)"
                  className="rounded-(--radius-pill) bg-warning-container px-2 py-0.5 text-label-sm text-on-warning-container hover:underline">
                  יש לו פרטי מקור משלו
                </button>
              )}
            </li>
          ))}
          {item.books.length === 0 && <li className="text-body-sm text-on-surface-variant">אין ספרים בסט (ייתכן שהנתיבים שונו ב-GitHub).</li>}
        </ul>
      )}
    </li>
  )
}

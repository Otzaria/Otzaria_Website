'use client'

import StatusBadge from '@/components/status/StatusBadge'

const FILE_TYPE_COLORS = {
  txt: 'bg-info-100 text-info-700',
  docx: 'bg-success-100 text-success-700',
}

export function FileTypeBadge({ fileType }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
        FILE_TYPE_COLORS[fileType] || 'bg-neutral-200 text-neutral-700'
      }`}
    >
      {fileType}
    </span>
  )
}

/** עמודות הרשומה המשותפות לשורת ספר ולשורת סט (סטטוס / מוסר / אופן) */
export function RecordColumns({ record, options }) {
  const methodLabel = record?.permissionMethod
    ? options.methods?.[record.permissionMethod]?.label || record.permissionMethod
    : ''

  return (
    <>
      <div className="md:w-40 shrink-0">
        {record ? (
          <StatusBadge status={record.status} statuses={options.statuses || {}} />
        ) : (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-neutral-200 text-neutral-600">
            ללא רשומה
          </span>
        )}
      </div>

      <div className="md:w-44 shrink-0 text-sm text-on-surface/80 truncate">
        {record?.ownerName || '—'}
      </div>

      <div className="md:w-28 shrink-0 text-sm text-on-surface/60 truncate">
        {methodLabel || '—'}
      </div>
    </>
  )
}

export function EditButton({ onEdit }) {
  return (
    <button
      onClick={onEdit}
      className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm hover:opacity-90 flex items-center gap-1"
    >
      <span className="material-symbols-outlined text-sm">edit</span>
      עריכה
    </button>
  )
}

export function BookRow({ item, options, onEdit }) {
  const record = item.record

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3 hover:bg-surface-variant/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-on-surface truncate">{item.bookTitle}</span>
          <FileTypeBadge fileType={item.fileType} />
          {record?.requireCredit && (
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-warning-100 text-warning-700">
              קרדיט חובה
            </span>
          )}
        </div>
        <p className="text-xs text-on-surface/50 truncate mt-0.5">{item.bookPath}</p>
      </div>

      <RecordColumns record={record} options={options} />
      <EditButton onEdit={onEdit} />
    </div>
  )
}

/**
 * שורת סט: כמה ספרים שחולקים רשומת מקור אחת (אוטומטי לפי "X על Y" או ידני).
 * ניתן להרחיב כדי לראות את הספרים שבו — למטא־נתונים אין שורה נפרדת לספר.
 */
export function SetRow({ item, options, expanded, onToggle, onEdit, onEditMember }) {
  const record = item.record

  return (
    <div className="bg-surface-variant/20">
      <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3 hover:bg-surface-variant/40 transition-colors">
        <button onClick={onToggle} className="flex-1 min-w-0 text-right" aria-expanded={expanded}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-primary text-base">library_books</span>
            <span className="font-bold text-on-surface truncate">{item.setName}</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-info-100 text-info-700">
              סט
            </span>
            {item.isManual && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-feature-100 text-feature-700">
                ידני
              </span>
            )}
            <span className="text-xs text-on-surface/60">{item.books.length} ספרים</span>
            {record?.requireCredit && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-warning-100 text-warning-700">
                קרדיט חובה
              </span>
            )}
            <span className="material-symbols-outlined text-on-surface/50 text-base">
              {expanded ? 'expand_less' : 'expand_more'}
            </span>
          </div>
        </button>

        <RecordColumns record={record} options={options} />
        <EditButton onEdit={onEdit} />
      </div>

      {expanded && (
        <div className="border-t border-surface-variant/50 divide-y divide-surface-variant/40">
          {item.books.map((member) => (
            <div key={member.bookPath} className="flex items-center gap-2 pr-10 pl-5 py-2 text-sm">
              <span className="text-on-surface/80 truncate">{member.bookTitle}</span>
              <FileTypeBadge fileType={member.fileType} />
              {member.hasOwnRecord && (
                <button
                  onClick={() => onEditMember?.(member)}
                  title="פתיחת הרשומה הנפרדת של הספר לעריכה או מחיקה"
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-warning-100 text-warning-700 hover:bg-warning-200 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px] leading-none">edit</span>
                  קיימת רשומה נפרדת
                </button>
              )}
            </div>
          ))}
          {item.books.length === 0 && (
            <p className="px-10 py-2 text-sm text-on-surface/50">
              אין ספרים בסט (ייתכן שהנתיבים שונו בגיטהאב).
            </p>
          )}
        </div>
      )}
    </div>
  )
}

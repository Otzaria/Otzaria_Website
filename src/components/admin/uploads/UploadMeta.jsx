import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import ExpandToggle from '@/components/ui/ExpandToggle'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { groupUploaders, isPageUpload, parseUploadName } from '@/lib/adminUploads/uploadGroups'
import { UPLOAD_TYPE_LABELS, formatNumber } from '@/lib/adminUploads/uploadTerms'
import { editCopyOf } from './uploadRowActions'
import RelativeTime from '@/components/ui/RelativeTime'

/** כמה קבצים בספר: "עמוד 83" / "12 עמודים" / "3 מתוך 12 קבצים" (כשהסינון מסתיר חלק) */
export function countText(visible, total) {
  if (visible.length === 1 && total === 1) {
    const { page } = parseUploadName(visible[0]?.bookName)
    return page !== null ? `עמוד ${page}` : null
  }
  const noun = visible.every(isPageUpload) ? 'עמודים' : 'קבצים'
  return visible.length < total
    ? `${formatNumber(visible.length)} מתוך ${formatNumber(total)} ${noun}`
    : `${formatNumber(visible.length)} ${noun}`
}

/**
 * שורת הפרטים מתחת לשם הספר: ממי, מתי (באשפה — מתי נמחק), כמה, ותגים: סוג (ספר שלם, ספר מדיקטה),
 * ספר אישי, מיקום (נתיב דיקטה), ו"עותק עריכה" — קישור לעותק, כך שרואים ברשימה אילו ספרים כבר בעבודה.
 * sort — במיון "הוותיקים קודם" מוצג התאריך של הוותיקה מבין המוצגות ("מאז..."), כדי שהסדר ייראה.
 * toggle — בספר שאפשר לפתוח: הספירה ("91 עמודים ▾", או "פרטים ▾" בספר שלם) היא כפתור הפתיחה —
 * במקום שבו העין כבר קוראת "כמה", בלי להזיז את השם, ורק בשורות שיש בהן מה לפתוח.
 * { expanded, controls, onToggle }.
 */
export default function UploadMeta({ group, variant, sort, toggle }) {
  const { visible } = group
  const uploader = groupUploaders(visible)
  const latest = visible[0]
  const oldest = visible[visible.length - 1]
  const count = countText(visible, group.uploads.length)
  const type = latest?.uploadType
  const copyId = variant === 'uploads' ? editCopyOf(group) : null
  const when = variant === 'trash'
    ? <RelativeTime key="when" date={latest?.deletedAt} prefix="נמחק" />
    : sort === 'oldest' && visible.length > 1
      ? <RelativeTime key="when" date={oldest?.uploadedAt} prefix="מאז" />
      : <RelativeTime key="when" date={(sort === 'oldest' ? oldest : latest)?.uploadedAt} />
  const parts = [
    <span key="who">
      {uploader.name}
      {uploader.others > 0 && ` ועוד ${formatNumber(uploader.others)} ${uploader.others === 1 ? 'משתמש' : 'משתמשים'}`}
    </span>,
    when,
    toggle
      ? <ExpandToggle key="count" label={count || 'פרטים'} {...toggle} />
      : count && <span key="count">{count}</span>,
    group.location && <span key="where" className="break-words">{group.location}</span>,
  ].filter(Boolean)

  // המפריד "·" לפני כל פריט, בשוליים שליליים: פריט שפותח שורה (בטלפון, כשהשורה נשברת) — המפריד
  // שלו נחתך ב-overflow, ולא נשאר "·" יתום בסוף שורה או בתחילתה
  return (
    <div className="mt-0.5 text-body-sm text-on-surface-variant">
      <div className="overflow-hidden">
        <div className="-ms-4 flex flex-wrap items-center gap-y-1">
          {parts.map((part) => (
            <span key={part.key} className="relative ps-4 before:absolute before:start-1.5 before:content-['·']">
              {part}
            </span>
          ))}
          {(type === 'full_book' || type === 'dicta') && <span className="ps-4"><Badge tone="primary">{UPLOAD_TYPE_LABELS[type]}</Badge></span>}
          {group.personal && <span className="ps-4"><Badge>ספר אישי</Badge></span>}
          {copyId && (
            <span className="ps-4">
              <Link
                href={`/library/admin/uploads/edit/${copyId}`}
                className={cx('inline-flex rounded-(--radius-pill) hover:brightness-95', FOCUS_RING)}
              >
                <Badge tone="success" icon="edit_note">יש עותק עריכה</Badge>
              </Link>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

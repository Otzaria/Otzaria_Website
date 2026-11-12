'use client'

import { memo } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import OpenChip from '@/components/admin/list/OpenChip'
import RelativeTime from '@/components/ui/RelativeTime'
import { shortTimeText } from '@/lib/adminMessagesScreen/messageTerms'
import { counterpart, isUnread, lastActivityDate, lastAuthor, snippet, subjectText } from '@/lib/adminMessagesScreen/conversations'
import { AREA_CHECK, AREA_MAIN, AREA_MENU, AREA_PRIMARY, AREA_TIME, INBOX_ROW_GRID, ROW_OPEN, ROW_PADDING, ROW_SECOND_LINE, TIME_INLINE } from './messageRowLayout'

/**
 * שורה ב"נכנסות": בחירה · מי בצד השני של השיחה (כפתור שפותח אותה; גם כשהצוות פתח אותה — מי שענה, לא המנהל) ותג
 * "חדש" אחריו · הנושא והמילים האחרונות בשיחה (כשהצוות כתב אחרון — "השבת:") · מתי (הפעילות האחרונה — אותו זמן
 * שלפיו ממוינים) · "סמן כנקרא" (רק בשורה חדשה) ו"פתח" · ⋮. שתי שורות טקסט קבועות; שורה חדשה — נקודה לפני השם
 * והקטע בצבע מלא, כך שרואים אותה גם בלי לקרוא את התג; שורה נבחרת — ברקע מודגש.
 *
 * @param {{ message: any, selected: boolean, onSelect: (ids: string[], checked: boolean) => void,
 *   onOpen: (message: any) => void, onMarkRead?: (message: any) => void,
 *   menuItems: import('@/components/ui/MenuButton').MenuItem[], busy?: boolean }} props
 */
function InboxRow({ message, selected, onSelect, onOpen, onMarkRead, menuItems, busy = false }) {
  const unread = isUnread(message)
  const name = counterpart(message).name
  const subject = subjectText(message.subject)
  const last = lastAuthor(message)
  const answered = Boolean(last?.fromTeam) && (message.replies || []).length > 0
  const when = lastActivityDate(message)
  return (
    <li data-row={message.id} aria-busy={busy || undefined} className={cx(INBOX_ROW_GRID, ROW_PADDING, 'transition-colors', selected && 'bg-surface-selected')}>
      <div className={AREA_CHECK}>
        <Checkbox data-row-focus="" label={`בחר את "${subject}" עם ${name}`} checked={selected} onChange={(checked) => onSelect([message.id], checked)} />
      </div>

      <div className={AREA_MAIN}>
        <div className="flex min-w-0 items-center gap-2">
          {/* מקום שמור גם בשורה שנקראה — השם לא זז כשמסמנים כנקרא */}
          <span aria-hidden="true" className={cx('-me-1 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
          <h3 className="min-w-0 text-title-sm text-on-surface">
            <button
              type="button"
              data-row-open=""
              aria-label={`פתח את השיחה "${subject}" עם ${name}${unread ? ' (חדשה)' : ''}`}
              title={name}
              onClick={() => onOpen(message)}
              className={cx(ROW_OPEN, TOUCH_TARGET_OVERLAY)}
            >
              <span className="min-w-0 truncate">{name}</span>
            </button>
          </h3>
          {unread && <Badge tone="neutral" className="shrink-0">חדש</Badge>}
          <span className="min-w-2 flex-1" />
          <span className={TIME_INLINE}><RelativeTime date={when} format={shortTimeText} /></span>
        </div>
        <p className={cx(ROW_SECOND_LINE, unread ? 'text-on-surface' : 'text-on-surface-variant')}>
          <span className="text-on-surface">{subject}</span>
          <span aria-hidden="true"> — </span>
          <span className="sr-only">. </span>
          {answered && 'השבת: '}{snippet(message)}
        </p>
      </div>

      <p className={AREA_TIME}><RelativeTime date={when} format={shortTimeText} /></p>
      <div className={AREA_PRIMARY}>
        {unread && onMarkRead && (
          <Button
            variant="text"
            size="sm"
            icon="mark_email_read"
            iconOnly
            aria-label={`סמן כנקרא: "${subject}" עם ${name}`}
            title="סמן כנקרא"
            disabled={busy}
            onClick={() => onMarkRead(message)}
          />
        )}
        {/* למקלדת ולקורא מסך השם הוא הכפתור; "פתח" כאן כדי שיהיה ברור שאפשר */}
        <OpenChip decorative label={`פתח את השיחה עם ${name}`} onClick={() => onOpen(message)} />
      </div>
      <div className={AREA_MENU}>
        <MenuButton label={`פעולות נוספות: ${subject}`} items={menuItems} />
      </div>
    </li>
  )
}

export default memo(InboxRow)

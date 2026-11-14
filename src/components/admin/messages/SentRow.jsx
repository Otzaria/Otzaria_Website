'use client'

import { memo } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import MenuButton from '@/components/ui/MenuButton'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import OpenChip from '@/components/admin/list/OpenChip'
import RelativeTime from '@/components/ui/RelativeTime'
import { shortTimeText } from '@/lib/adminMessagesScreen/messageTerms'
import { audienceText, snippet, subjectText } from '@/lib/adminMessagesScreen/conversations'
import { AREA_MAIN_SENT, AREA_MENU, AREA_PRIMARY, AREA_TIME, ROW_OPEN, ROW_PADDING, ROW_SECOND_LINE, SENT_ROW_GRID, TIME_INLINE } from './messageRowLayout'

/**
 * שורה ב"נשלחו": אל מי (שם, או "40 נמענים" — הודעה לכל המשתמשים, מקובצת לשורה אחת) · הנושא והטקסט · מתי (הפעילות
 * האחרונה — אותו זמן שלפיו ממוינים, כולל תשובה נוספת של הצוות) ·
 * "פתח" · ⋮ (מחק לצמיתות). בלי בחירה: אין פעולה מרובה על הודעות שנשלחו.
 *
 * @param {{ group: ReturnType<typeof import('@/lib/adminMessagesScreen/conversations').groupSent>[number],
 *   onOpen: (group: any) => void, menuItems: import('@/components/ui/MenuButton').MenuItem[], busy?: boolean }} props
 */
function SentRow({ group, onOpen, menuItems, busy = false }) {
  const many = group.recipients.length > 1
  const audience = audienceText(group)
  const lastMessage = group.messages[0]
  const subject = subjectText(group.subject)
  const when = group.lastActivityDate ?? group.createdAt
  return (
    <li data-row={group.id} aria-busy={busy || undefined} className={cx(SENT_ROW_GRID, ROW_PADDING)}>
      <div className={AREA_MAIN_SENT}>
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 text-title-sm text-on-surface">
            <button
              type="button"
              data-row-open=""
              aria-label={`פתח את ההודעה "${subject}" אל ${audience}`}
              title={audience}
              onClick={() => onOpen(group)}
              className={cx(ROW_OPEN, TOUCH_TARGET_OVERLAY, 'items-center gap-1')}
            >
              <span aria-hidden="true" className="shrink-0 text-on-surface-variant">אל</span>
              {many && <AppIcon name="group" className="shrink-0 text-icon-sm leading-none text-on-surface-variant" />}
              <span className="min-w-0 truncate">{audience}</span>
            </button>
          </h3>
          <span className="min-w-2 flex-1" />
          <span className={TIME_INLINE}><RelativeTime date={when} format={shortTimeText} /></span>
        </div>
        <p className={cx(ROW_SECOND_LINE, 'text-on-surface-variant')}>
          <span className="text-on-surface">{subject}</span>
          <span aria-hidden="true"> — </span>
          <span className="sr-only">. </span>
          {snippet(lastMessage)}
        </p>
      </div>

      <p className={AREA_TIME}><RelativeTime date={when} format={shortTimeText} /></p>
      <div className={AREA_PRIMARY}>
        <OpenChip decorative label={`פתח את ההודעה אל ${audience}`} onClick={() => onOpen(group)} />
      </div>
      <div className={AREA_MENU}>
        <MenuButton label={`פעולות נוספות: ${subject}`} items={menuItems} />
      </div>
    </li>
  )
}

export default memo(SentRow)

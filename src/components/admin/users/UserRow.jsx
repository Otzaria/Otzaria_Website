'use client'

import { memo } from 'react'
import MenuButton from '@/components/ui/MenuButton'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import OpenChip from '@/components/admin/list/OpenChip'
import RelativeTime from '@/components/ui/RelativeTime'
import { formatNumber } from '@/lib/adminTerms'
import { activityCounts, displayName, hasName, showsRoleTag } from '@/lib/adminUsersScreen/userTerms'
import { RoleTag, TeamChips } from './UserTags'
import {
  AREA_JOINED, AREA_MAIN, AREA_MENU, AREA_PAGES, AREA_POINTS, AREA_PRIMARY, AREA_ROLE, AREA_SUB, AREA_TEAMS, ROW_GRID, ROW_PADDING, TAGS_LINE,
} from './userRowLayout'

/**
 * שם המשתמש בשורה: כפתור שפותח את המגירה, שנראה כמו טקסט. שורה אחת (שם ארוך נחתך; המלא ב-title), ומטרת
 * מגע של 44px בלי להגדיל את השורה (TOUCH_TARGET_OVERLAY — לכן החיתוך על הטקסט שבפנים, לא על הכפתור).
 */
const ROW_NAME = cx(
  'flex max-w-full cursor-pointer rounded-(--radius-control) text-start outline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary',
  TOUCH_TARGET_OVERLAY
)

const MUTED = <span aria-hidden="true" className="text-on-surface-variant">—</span>

/**
 * שורת משתמש: שם (כפתור שפותח את המגירה) ומתחתיו הדואר (משמאל לימין; ארוך — נחתך בסוף, כך שרואים את
 * תחילתו), תפקיד (משתמש רגיל — בלי תג), צוותים והגבלות כצ'יפים קטנים, נקודות, עמודים שהושלמו, מתי הצטרף,
 * "פתח" (admin/list/OpenChip) ו-⋮. ברשימה צרה — התפקיד והצוותים בשורה אחת, והמונים בשורה אחת, לכל רוחב
 * השורה. משתמש בלי שם — "(בלי שם)" באפור, והדואר בשורה השנייה כרגיל.
 *
 * @param {{ user: any, onOpen: (user: any) => void, menuItems: import('@/components/ui/MenuButton').MenuItem[] }} props
 *   user — כמו שהוא נראה עכשיו (כולל מתג שממתין ל"בטל")
 */
function UserRow({ user, onOpen, menuItems }) {
  const name = displayName(user)
  const named = hasName(user)
  const counts = activityCounts(user)
  return (
    <li data-row={user._id} className={cx(ROW_GRID, ROW_PADDING)}>
      <div className={AREA_MAIN}>
        <h3 className="text-title-sm text-on-surface">
          <button type="button" data-row-open="" aria-label={`פתח את ${name}`} title={name} onClick={() => onOpen(user)} className={ROW_NAME}>
            <span className={cx('min-w-0 truncate', !named && 'text-on-surface-variant')}>{named ? name : '(בלי שם)'}</span>
          </button>
        </h3>
        <p dir="ltr" title={user.email} className="mt-0.5 truncate text-end text-body-sm text-on-surface-variant">
          <bdi>{user.email}</bdi>
        </p>
      </div>

      {/* ברשימה צרה: שורת תגים (תפקיד וצוותים) ושורת מונים — כל אחת בשורה אחת, כך שגובה השורה קבוע */}
      <div className={AREA_SUB}>
        <TeamChips user={user} className={TAGS_LINE} lead={showsRoleTag(user.role) ? <RoleTag role={user.role} /> : null} empty={<div aria-hidden="true" className={TAGS_LINE} />} />
        <p className="mt-1 truncate text-body-sm tabular-nums text-on-surface-variant">
          {formatNumber(counts.points)} נקודות · {counts.completed === 1 ? 'עמוד אחד הושלם' : `${formatNumber(counts.completed)} עמודים הושלמו`}
        </p>
      </div>

      <div className={AREA_ROLE}><RoleTag role={user.role} fallback={<span className="text-body-sm text-on-surface-variant">{MUTED}<span className="sr-only">משתמש</span></span>} /></div>
      <div className={AREA_TEAMS}><TeamChips user={user} empty={MUTED} /></div>
      {/* מספר שלא נכנס נחתך בסוף (dir=ltr — רואים את תחילתו), והמלא ב-title */}
      <p className={cx(AREA_POINTS, 'text-end')} dir="ltr" title={formatNumber(counts.points)}><span className="sr-only">נקודות: </span>{formatNumber(counts.points)}</p>
      <p className={AREA_PAGES}><span className="sr-only">עמודים שהושלמו: </span>{formatNumber(counts.completed)}</p>
      <p className={AREA_JOINED}>{user.createdAt ? <><span className="sr-only">הצטרף </span><RelativeTime date={user.createdAt} /></> : '—'}</p>

      <div className={AREA_PRIMARY}>
        {/* למקלדת ולקורא מסך השם הוא הכפתור; "פתח" כאן כדי שיהיה ברור שאפשר */}
        <OpenChip decorative label={`פתח את ${name}`} onClick={() => onOpen(user)} />
      </div>
      <div className={AREA_MENU}>
        <MenuButton label={`פעולות נוספות: ${name}`} items={menuItems} />
      </div>
    </li>
  )
}

export default memo(UserRow)

/** כותרות העמודות — רק ברשימה רחבה; לקורא המסך כל תא אומר מה הוא (sr-only), ולכן aria-hidden */
export function UserColumnsHeader() {
  return (
    <div aria-hidden="true" className={cx(ROW_GRID, ROW_PADDING, 'hidden min-h-11 border-b border-outline-variant/60 py-1 text-label-md text-on-surface-variant @4xl:grid')}>
      <span className="[grid-area:main] ps-2 sm:ps-3">משתמש</span>
      <span className="[grid-area:role]">תפקיד</span>
      <span className="[grid-area:teams]">צוותים והגבלות</span>
      <span className="[grid-area:points]">נקודות</span>
      <span className="[grid-area:pages]">עמודים שהושלמו</span>
      <span className="[grid-area:joined]">הצטרף</span>
    </div>
  )
}

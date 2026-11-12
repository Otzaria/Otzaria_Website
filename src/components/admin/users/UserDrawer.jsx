'use client'

import { useCallback, useEffect, useId } from 'react'
import ActionList from '@/components/ui/ActionList'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import RelativeTime from '@/components/ui/RelativeTime'
import { loginHref } from '@/components/admin/list/adminRequest'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { formatNumber } from '@/lib/adminTerms'
import { BLOCKED, activityCounts, displayName } from '@/lib/adminUsersScreen/userTerms'
import UserDetailsSection from './UserDetailsSection'
import UserTeamsSection from './UserTeamsSection'
import { FlagChip } from './UserTags'
import { DRAWER_HEADING, DRAWER_SECTION } from './drawerStyles'
import { useUserDetails } from './useUserDetails'

const DT = 'text-label-md text-on-surface-variant'

/** "פעילות": המונים שיש בנתונים — נקודות, עמודים שהושלמו, עמודים בעבודה */
function UserActivity({ user, headingId }) {
  const c = activityCounts(user)
  const items = [['נקודות', c.points], ['עמודים שהושלמו', c.completed], ['עמודים בעבודה', c.inProgress]]
  return (
    <section aria-labelledby={headingId} className={DRAWER_SECTION}>
      <h3 id={headingId} className={DRAWER_HEADING}>פעילות</h3>
      <dl className="grid grid-cols-3 gap-2 rounded-(--radius-control) bg-surface p-3 text-center">
        {items.map(([label, n]) => (
          <div key={label} className="min-w-0"><dt className={DT}>{label}</dt><dd className="text-title-md tabular-nums text-on-surface [overflow-wrap:anywhere]">{formatNumber(n)}</dd></div>
        ))}
      </dl>
    </section>
  )
}

/** שגיאת שמירה בתחתית המגירה; התחברות שפגה — עם קישור "התחבר" */
function SaveError({ error }) {
  return (
    <p role="alert" className="me-auto min-w-0 flex-1 basis-48 text-body-sm text-error">
      {error.message}
      {error.sessionExpired && <> <a href={loginHref()} className="font-semibold underline">התחבר</a></>}
    </p>
  )
}

/**
 * מגירת משתמש — רכיב משותף: נבנה כך שאפשר לפתוח אותו גם ממסכים אחרים (למשל מהמציע בהצעות עריכה), עם
 * המשתמש במבנה של GET /api/admin/users. הכתיבות — דרך writes (useUserWrites, ברמת המסך: תור אחד, ומתגים
 * שממתינים ל"בטל" שורדים את סגירת המגירה); מי שפותח מעדכן את הרשימה שלו (onSaved) ומטפל בפעולות שפותחות
 * חלון (onMessage, onDelete — ראו useUserDialogs).
 *
 * הסדר: פרטים · תפקיד (הטופס, ו"שמור" בתחתית) · צוותים · הגבלות (מתגים, כל אחד נשמר לבד עם "בטל") ·
 * פעילות · "שלח הודעה" · ובסוף, באדום, "מחק לצמיתות". שינוי שלא נשמר בטופס — "לצאת בלי לשמור?" לפני סגירה,
 * ואזהרת הדפדפן ברענון. בזמן "שומר…" הסגירה לא שואלת: השמירה ממשיכה, והתוצאה בהודעה קופצת. סגירה —
 * מתגים שעוד ממתינים נשלחים מיד. "אחורה" בדפדפן — אצל המסך (onDirtyChange).
 *
 * @param {{ user: any, viewerId?: string, onClose: () => void, writes: ReturnType<typeof import('./useUserWrites').useUserWrites>,
 *   onSaved: (patch: any) => void, onGone: (user: any) => void, onReopen?: (user: any) => void,
 *   onMessage: (user: any) => void, onDelete: (user: any) => void, toast: any,
 *   returnFocus?: () => HTMLElement | null, onDirtyChange?: (dirty: boolean) => void }} props
 */
export default function UserDrawer({ user, viewerId, onClose, writes, onSaved, onGone, onReopen, onMessage, onDelete, toast, returnFocus, onDirtyChange }) {
  const [confirm, confirmElement] = useConfirm()
  const self = Boolean(viewerId) && String(viewerId) === String(user._id)
  const details = useUserDetails({ user, self, confirm, toast, writes, onSaved, onGone, onReopen })
  const ids = { details: useId(), role: useId(), teams: useId(), restrictions: useId(), activity: useId(), actions: useId() }
  const name = displayName(user)
  const blocked = user.dictaEditBlocked === true
  // שינוי שעוד לא יצא; בזמן "שומר…" — כבר יצא, ואין מה לאבד
  const unsaved = details.dirty && !details.saving

  useEffect(() => {
    onDirtyChange?.(unsaved)
  }, [unsaved, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  // סגירה: מה שממתין ל"בטל" במגירה — נשלח עכשיו (מה שהוחלט לא הולך לאיבוד)
  const { flushUser } = writes
  const userId = user._id
  useEffect(() => () => flushUser(userId), [flushUser, userId])
  const { guardLeave } = useUnsavedChangesGuard(unsaved, () => confirm(unsavedConfirm('השינויים בפרטים או בתפקיד לא נשמרו.')), { trapBack: false })

  const close = useCallback(async () => {
    if (await guardLeave()) onClose()
  }, [guardLeave, onClose])

  const actions = [
    { id: 'message', icon: 'mail', label: 'שלח הודעה', onSelect: () => onMessage(user) },
    { separator: true, id: 'sep' },
    {
      id: 'delete',
      icon: 'delete_forever',
      label: self ? 'מחק לצמיתות (אי אפשר למחוק את החשבון שלך)' : 'מחק לצמיתות',
      danger: true,
      disabled: self,
      onSelect: () => onDelete(user),
    },
  ]

  return (
    <Drawer
      title={name}
      subtitle={(
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <bdi dir="ltr" className="min-w-0 max-w-full [overflow-wrap:anywhere]">{user.email}</bdi>
          {self && <Badge tone="neutral">החשבון שלך</Badge>}
          {user.isVerified === false && <Badge tone="warning">לא אומת</Badge>}
          {blocked && <FlagChip team={BLOCKED} />}
          {user.createdAt && <span>הצטרף <RelativeTime date={user.createdAt} /></span>}
        </span>
      )}
      onClose={close}
      returnFocus={returnFocus}
      footer={(
        <>
          {details.saveError && <SaveError error={details.saveError} />}
          {details.dirty && <Button variant="text" size="sm" onClick={details.reset} disabled={details.saving}>בטל שינויים</Button>}
          <Button variant="filled" size="sm" onClick={details.save} loading={details.saving} disabled={!details.dirty}>
            {details.saving ? 'שומר…' : 'שמור'}
          </Button>
        </>
      )}
    >
      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); details.save() }} noValidate>
        <UserDetailsSection details={details} headingIds={ids} />
        <UserTeamsSection user={user} teams={writes.teams} headingIds={ids} />
        <UserActivity user={user} headingId={ids.activity} />
        <section aria-labelledby={ids.actions} className={DRAWER_SECTION}>
          <h3 id={ids.actions} className="sr-only">פעולות</h3>
          <ActionList label={`פעולות על ${name}`} items={actions} />
        </section>
        {/* Enter בשדה שומר */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {confirmElement}
    </Drawer>
  )
}

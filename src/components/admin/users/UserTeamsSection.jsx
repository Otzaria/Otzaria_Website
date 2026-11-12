'use client'

import { useId } from 'react'
import Switch from '@/components/ui/Switch'
import RelativeTime from '@/components/ui/RelativeTime'
import { BLOCKED, RESTRICTIONS, TEAM_FLAGS, blockReason, teamDescription } from '@/lib/adminUsersScreen/userTerms'
import { DRAWER_HEADING, DRAWER_SECTION } from './drawerStyles'

/** "יישמר בעוד כמה שניות · בטל" — ליד המתג עצמו (בתוך המגירה, נגיש במקלדת), ומחובר להסבר של המתג */
function PendingNote({ id, onUndo }) {
  return (
    <p className="-mt-1 mb-1 flex flex-wrap items-center gap-x-2 text-body-sm text-on-surface-variant">
      <span id={id}>יישמר בעוד כמה שניות.</span>
      <button type="button" onClick={onUndo} className="rounded-(--radius-control) px-1 text-label-md text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
        בטל
      </button>
    </p>
  )
}

/** מתג אחד, וסימון "ממתין" כשהשינוי עוד לא נשלח */
function FlagSwitch({ user, team, teams, description, tone }) {
  const pendingId = useId()
  const waiting = teams.waiting(user, team)
  return (
    <div>
      <Switch
        checked={teams.value(user, team)}
        onChange={(next) => teams.toggle(user, team, next, { inline: true })}
        disabled={teams.sending(user, team)}
        label={team.label}
        description={description}
        tone={tone}
        describedBy={waiting ? pendingId : undefined}
      />
      {waiting && <PendingNote id={pendingId} onUndo={() => teams.undo(user, team)} />}
    </div>
  )
}

/**
 * "צוותים" ו"הגבלות" במגירה — שני מקטעים נפרדים: חסימה היא לא צוות. מתג לכל אחד; כל מתג נשמר לבד, אחרי כמה
 * שניות שבהן אפשר לבטל (useUserWrites) — לא דרך "שמור" של הטופס. מתג שבקשה שלו באוויר — מושבת.
 * מתג החסימה בצבע השגיאה. בחסימה שקיימת — הסיבה שנרשמה (אם יש סיבה של ממש) ומתי.
 *
 * @param {{ user: any, teams: ReturnType<typeof import('./useUserWrites').useUserWrites>['teams'],
 *   headingIds: { teams: string, restrictions: string } }} props
 */
export default function UserTeamsSection({ user, teams, headingIds }) {
  const blocked = teams.value(user, BLOCKED)
  const savedBlocked = user.dictaEditBlocked === true
  const reason = blockReason(user)
  const blockedDetails = savedBlocked && blocked && (reason || user.dictaEditBlockedAt)
  return (
    <>
      <section aria-labelledby={headingIds.teams} className={DRAWER_SECTION}>
        <div>
          <h3 id={headingIds.teams} className={DRAWER_HEADING}>צוותים</h3>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            כל שינוי כאן נשמר לבד, אחרי כמה שניות שבהן אפשר לבטל. בסרגל שלו הצוות יופיע כשיתחבר מחדש.
          </p>
        </div>
        <div className="flex flex-col rounded-(--radius-control) bg-surface px-3 py-1">
          {TEAM_FLAGS.map((team) => (
            <FlagSwitch key={team.id} user={user} team={team} teams={teams} description={teamDescription(team, { blocked })} />
          ))}
        </div>
      </section>

      <section aria-labelledby={headingIds.restrictions} className={DRAWER_SECTION}>
        <div>
          <h3 id={headingIds.restrictions} className={DRAWER_HEADING}>הגבלות</h3>
          <p className="mt-1 text-body-sm text-on-surface-variant">החסימה חלה מיד, ונשמרת לבד כמו הצוותים.</p>
        </div>
        <div className="flex flex-col rounded-(--radius-control) bg-surface px-3 py-1">
          {RESTRICTIONS.map((team) => (
            <FlagSwitch
              key={team.id}
              user={user}
              team={team}
              teams={teams}
              tone="error"
              description={(
                <>
                  {team.description}
                  {blockedDetails && (
                    <span className="mt-1 block">
                      {reason && <>הסיבה: {reason}. </>}
                      {user.dictaEditBlockedAt && <RelativeTime date={user.dictaEditBlockedAt} prefix="נחסם" />}
                    </span>
                  )}
                </>
              )}
            />
          ))}
        </div>
      </section>
    </>
  )
}

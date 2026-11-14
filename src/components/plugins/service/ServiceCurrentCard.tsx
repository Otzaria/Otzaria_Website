'use client'

import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Ltr from '@/components/ui/Ltr'
import { formatDateShort } from '@/lib/formatDate'
import { archLabel, osLabel } from './servicePlatforms'
import type { ManageResponse } from './serviceSubmissionLogic'
import { formatRange } from './serviceVersion'

/** הגרסה המפורסמת כעת, מגבלת 21 הימים, וחזרה לגרסת השירות הקודמת (כשאפשר) */
export default function ServiceCurrentCard({ manage, onRollback, rollingBack }: {
  manage: ManageResponse
  /** בלי פעולה (צפיית מנהל) — הכפתור לא מוצג */
  onRollback?: () => void
  rollingBack: boolean
}) {
  const current = manage.current
  return (
    <Card tone="raised" padding="md" className="flex flex-col gap-3">
      <h2 className="text-title-md text-on-surface">הגרסה המפורסמת</h2>
      {current?.serviceVersion ? (
        <>
          <p className="text-body-md text-on-surface">
            שירות <Ltr>{current.serviceVersion}</Ltr> · תוסף <Ltr>{current.pluginVersion}</Ltr>
            {current.serviceRange ? <> · טווח תאימות <Ltr>{formatRange(current.serviceRange)}</Ltr></> : null}
          </p>
          {current.platforms.length > 0 && (
            <ul className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
              {current.platforms.map((p) => (
                <li key={`${p.os}-${p.arch}`}>
                  <Ltr>{`${osLabel(p.os)} · ${archLabel(p.arch)}`}</Ltr>
                  {p.minOs ? <> · מינימום <Ltr>{p.minOs}</Ltr></> : null}
                  {p.port ? <> · פורט <Ltr>{String(p.port)}</Ltr></> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-body-md text-on-surface-variant">עדיין אין גרסה מאושרת של השירות.</p>
      )}

      {manage.cooldown.blocked && manage.cooldown.nextAllowedAt && (
        <p className="text-body-sm text-on-surface-variant">
          בדיקת שירות חדשה אפשרית מ-<Ltr>{formatDateShort(manage.cooldown.nextAllowedAt)}</Ltr>
          {manage.adminException ? ' (אושרה חריגת מנהל להתחלה מוקדמת).' : '.'}
        </p>
      )}

      {manage.canRollback && onRollback && (
        <div>
          <Button variant="outlined" size="sm" icon="undo" loading={rollingBack} onClick={onRollback}>
            חזרה לגרסת השירות הקודמת
          </Button>
          <p className="mt-1.5 text-body-sm text-on-surface-variant">
            מחליף בחנות את השירות ואת התוסף הכלול בו לגרסה הקודמת. אינו משנה התקנות קיימות ואינו מאפס את 21 הימים.
          </p>
        </div>
      )}
    </Card>
  )
}

import type { ReactNode } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import Ltr from '@/components/ui/Ltr'
import { SERVICE_WARNING_TEXT } from '@/components/plugins/service/ServiceWarning'
import type { Plugin } from './types'

/**
 * הודעות מצב מעל כותרת התוסף: צפייה בגרסה ישנה (warning), תוסף מושהה (error) — הנוסח הקיים — ותוסף
 * שדורש שירות חיצוני (warning, האזהרה הקבועה של המפרט).
 * role="note": מידע משלים שאינו התראה דחופה. הצבע — משטח המצב (container) מהפלטה, כך שגם בערכה
 * הכהה הוא נשאר קריא; המשמעות תמיד בכותרת הטקסטואלית.
 */
const TONES = {
  warning: 'bg-warning-container text-on-warning-container',
  error: 'bg-error-container text-on-error-container'
} as const

function Banner({ tone, icon, title, children, action }: {
  tone: keyof typeof TONES
  icon: string
  title: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role="note"
      data-tone={tone}
      className={cx(
        'flex flex-col gap-3 rounded-(--card-radius) p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
        TONES[tone]
      )}
    >
      <div className="flex items-start gap-3">
        <AppIcon name={icon} className="mt-0.5 shrink-0 text-2xl" />
        <div className="min-w-0">
          <p className="text-title-sm">{title}</p>
          <p className="mt-0.5 text-body-sm opacity-90">{children}</p>
        </div>
      </div>
      {action && <div className="shrink-0 ps-9 sm:ps-0">{action}</div>}
    </div>
  )
}

export default function PluginStateBanners({ plugin, canEdit, suspendedByAdmin, className }: {
  plugin: Pick<Plugin, 'id' | 'version' | 'latestVersion' | 'isHistoricalVersion' | 'isSuspended' | 'hasService'>
  canEdit: boolean
  suspendedByAdmin: boolean
  className?: string
}) {
  if (!plugin.isHistoricalVersion && !plugin.isSuspended && !plugin.hasService) return null
  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {plugin.isHistoricalVersion && (
        <Banner
          tone="warning"
          icon="history"
          title={<>גרסה ישנה (<Ltr>{plugin.version}</Ltr>)</>}
          action={
            <Button href={`/plugins/${plugin.id}`} variant="filled" size="sm" icon="upgrade">
              עבור לגרסה העדכנית
            </Button>
          }
        >
          אתה צופה בגרסה קודמת של התוסף.
          {plugin.latestVersion && plugin.latestVersion !== plugin.version
            ? <> הגרסה העדכנית היא <Ltr>{plugin.latestVersion}</Ltr>.</>
            : null}
        </Banner>
      )}

      {/* מוצג רק למי שרשאי לראות תוסף מושהה */}
      {plugin.isSuspended && (
        <Banner
          tone="error"
          icon="pause_circle"
          title={`התוסף מושהה ${suspendedByAdmin ? 'על ידי הנהלת האתר' : canEdit ? 'על ידך' : 'על ידי מעלה התוסף'}`}
        >
          התוסף אינו מופיע בחנות ואינו זמין להורדה. הדף נגיש בקישור ישיר למעלה התוסף ולמנהלי האתר בלבד.
          {canEdit && (suspendedByAdmin
            ? ' להחזרת התוסף לחנות יש לפנות למנהל.'
            : ' ניתן להחזירו לחנות בכל עת בכפתור "החזר לחנות".')}
        </Banner>
      )}

      {plugin.hasService && (
        <Banner tone="warning" icon="warning" title="התוסף דורש שירות חיצוני">
          {SERVICE_WARNING_TEXT}
        </Banner>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import LoadError from '@/components/admin/list/LoadError'
import { AdminApiError, errorToast, send } from '@/components/admin/list/adminRequest'
import AppIcon from '@/components/ui/AppIcon'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import Tabs, { tabPanelProps } from '@/components/ui/Tabs'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessages } from '@/components/plugins/service/serviceSubmissionLogic'
import { formatDateWithTime } from '@/lib/formatDate'
import EmergencyExceptionDialog from './EmergencyExceptionDialog'
import ServiceReviewAdminCard from './ServiceReviewAdminCard'
import {
  SERVICE_TABS,
  adminActionsFor,
  defaultServiceTab,
  groupAdminReviews,
  quotaPause,
  rollbackReviewIds,
  type AdminAction,
  type AdminReview,
  type ServiceTab
} from './servicePluginsAdminLogic'
import { useServiceAdminData, type ServiceAdminSource } from './useServiceAdminData'

const TAB_PREFIX = 'service-plugins'

const CONFIRMS: Partial<Record<AdminAction, { title: string; body: string; details?: string[]; confirmLabel: string; tone?: 'danger' }>> = {
  start: {
    title: 'לאשר ולהתחיל בדיקה?',
    body: 'זה האישור לפרסום: אם כל הבדיקות יעברו, ההגשה תתפרסם לבד — בלי לחיצה נוספת.',
    details: [
      'אם הבדיקה תדחה את ההגשה — המפתח יקבל דוח. לא צריך לעשות כלום.',
      'בדיקת שירות מתחילה תקופה של 21 יום עד הבדיקה הבאה — גם אם תידחה או תבוטל.'
    ],
    confirmLabel: 'אשר והתחל בדיקה'
  },
  cancel: {
    title: 'לבטל את ההגשה?',
    body: 'המפתח יצטרך להגיש שוב.',
    details: ['ביטול אחרי שבדיקת השירות התחילה לא מאפס את 21 הימים.'],
    confirmLabel: 'בטל הגשה',
    tone: 'danger'
  },
  retry: {
    title: 'לנסות שוב?',
    body: 'ההגשה תחזור לבדיקה. ודא קודם שאחראי השרת תיקן את התקלה.',
    details: ['אין בזה תקופת 21 יום חדשה.'],
    confirmLabel: 'נסה שוב'
  },
  rollback: {
    title: 'לחזור לגרסה הקודמת?',
    body: 'השירות והתוסף שבחנות יחזרו לגרסה הקודמת.',
    details: ['מי שכבר התקין — לא מושפע.', 'לא מאפס את 21 הימים.'],
    confirmLabel: 'חזור לגרסה הקודמת'
  }
}

const EMPTY: Record<ServiceTab, { title: string; description?: string; icon: string }> = {
  pending: { icon: 'task_alt', title: 'אין הגשות שממתינות לאישור' },
  failed: { icon: 'task_alt', title: 'אין הגשות שנעצרו בתקלה', description: 'כל הבדיקות האחרונות רצו בלי תקלה.' },
  inProgress: { icon: 'hourglass_top', title: 'אין הגשות בבדיקה' },
  draft: { icon: 'edit_note', title: 'אין טיוטות' },
  closed: { icon: 'done_all', title: 'אין הגשות שהסתיימו לאחרונה' }
}

const TAB_NOTES: Partial<Record<ServiceTab, string>> = {
  failed: 'אלה לא דחיות: הבדיקה נעצרה בגלל תקלה אצלנו, בשרת הבדיקה. העבר את הפרטים לאחראי השרת, ואחרי התיקון — "נסה שוב".',
  draft: 'המפתח עדיין מעלה קבצים. טיוטה שלא הושלמה מתבטלת לבד אחרי 24 שעות.'
}

function ServiceSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="sr-only">טוען את תוספי השירות…</p>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-11 w-full" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    </div>
  )
}

/**
 * תצוגת "תוספי שירות" במסך התוספים: ההגשות בלשוניות (ממתין לאישור · נעצר בתקלה · בבדיקה · טיוטה · סגור), עם
 * הפעולות שמותרות לכל הגשה. ממשק בלבד — אותן נקודות קצה ואותם גופים כמו קודם (POST
 * /api/service-plugins/admin/[pluginId]); השרת מעדכן את ההגשות בעדכונים מותנים בלבד.
 * source — הנתונים מהמסך (שטוען אותם גם בשביל המונה); בלעדיו הרכיב טוען בעצמו.
 * הלשונית נקבעת בכניסה (הראשונה שיש בה משהו) ולא זזה לבד אחרי פעולה, גם כשהיא מתרוקנת.
 */
export default function ServicePluginsAdmin({ source }: { source?: ServiceAdminSource }) {
  const own = useServiceAdminData(!source)
  const { load, reload } = source ?? own
  const toast = useToast() as { show: (t: { message: string; tone?: 'error' | 'success' | 'info'; action?: { label: string; href?: string } }) => void }
  const [confirm, confirmElement] = useConfirm() as unknown as [(o: object) => Promise<boolean>, React.ReactNode]
  const [busy, setBusy] = useState<{ id: string; action: AdminAction } | null>(null)
  const [exceptionFor, setExceptionFor] = useState<AdminReview | null>(null)
  const [tab, setTab] = useState<ServiceTab | null>(null)

  const post = async (review: AdminReview, action: AdminAction, reason?: string): Promise<boolean> => {
    setBusy({ id: review.id, action })
    try {
      // send של adminRequest: התחברות שפגה (הפניה או 401), אין חיבור או השרת לא עונה — AdminApiError
      const response = await send(`/api/service-plugins/admin/${encodeURIComponent(review.pluginId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId: review.id, ...(reason ? { reason } : {}) })
      })
      if (!response.ok) {
        let body: unknown = null
        try { body = await response.json() } catch { /* גוף לא JSON */ }
        const message = apiErrorMessages(body, 'הפעולה לא הצליחה.').join(' ')
        toast.show({ tone: 'error', message })
        return false
      }
      return true
    } catch (error) {
      toast.show(error instanceof AdminApiError
        ? { ...errorToast(error, 'הפעולה לא הצליחה.'), tone: 'error' }
        : { tone: 'error', message: 'אין חיבור לשרת. בדוק את החיבור ונסה שוב.' })
      return false
    } finally {
      setBusy(null)
      await reload()
    }
  }

  const handleAction = async (review: AdminReview, action: AdminAction) => {
    if (action === 'emergency') {
      setExceptionFor(review)
      return
    }
    const options = CONFIRMS[action]
    if (options && !(await confirm({ ...options, body: `״${review.pluginName ?? ''}״ — ${options.body}` }))) return
    if (await post(review, action)) {
      const done: Partial<Record<AdminAction, string>> = { start: 'הבדיקה התחילה', cancel: 'ההגשה בוטלה', retry: 'ההגשה חזרה לבדיקה', rollback: 'החנות חזרה לגרסה הקודמת' }
      if (done[action]) toast.show({ tone: 'success', message: `״${review.pluginName ?? ''}״: ${done[action]}` })
    }
  }

  if (load.phase === 'loading') return <ServiceSkeleton />
  if (load.phase === 'disabled') {
    return <EmptyState icon="block" title="תוספי השירות כבויים באתר" description="כשיופעלו, ההגשות שלהם יופיעו כאן." />
  }
  if (load.phase === 'error') {
    return <LoadError error={load.error} title="לא הצלחנו לטעון את תוספי השירות" sessionText="התחבר מחדש כדי לראות את תוספי השירות. אחרי ההתחברות תחזור לכאן." onRetry={() => void reload()} />
  }

  const { data } = load
  const groups = groupAdminReviews(data.reviews)
  const rollbackIds = rollbackReviewIds(data.reviews)
  const pausedUntil = quotaPause(data.control)
  if (tab === null) setTab(defaultServiceTab(groups))
  const current = tab ?? defaultServiceTab(groups)
  const currentTab = SERVICE_TABS.find((t) => t.id === current)!
  const reviews = groups[currentTab.group]

  return (
    <div className="flex flex-col gap-5">
      <details className="group rounded-(--radius-control) bg-surface px-4 py-3 text-body-sm text-on-surface-variant">
        <summary className="flex min-h-(--touch-target) cursor-pointer list-none items-center gap-2 text-label-lg text-on-surface [&::-webkit-details-marker]:hidden">
          <AppIcon name="shield" className="text-icon-lg text-primary" />
          <span className="flex-1">איך נבדקת הגשה</span>
          <AppIcon name="expand_more" className="text-icon-lg group-open:hidden" />
          <AppIcon name="expand_less" className="hidden text-icon-lg group-open:inline" />
        </summary>
        <p className="mt-1">
          לפני פרסום, כל הגשה נבדקת אוטומטית: שהקבצים זהים למה שנבנה בפועל, שהבנייה הצליחה, ושאין בהם תוכנה מזיקה.
          {' '}יש גם קריאה אוטומטית של הקוד, שמחפשת מקומות מסוכנים — היא עוזרת, אבל לא מבטיחה שאין בעיה.
        </p>
        <p className="mt-1.5">
          ״אשר והתחל בדיקה״ הוא האישור היחיד לפרסום: אם הבדיקות עוברות — ההגשה מתפרסמת לבד. אין דרך לעקוף ממצא אבטחה.
        </p>
      </details>

      {pausedUntil && (
        <p role="status" className="rounded-(--radius-control) bg-warning-container px-4 py-3 text-body-sm text-on-warning-container">
          הבדיקות מושהות עד {formatDateWithTime(pausedUntil)}, כי נגמרה המכסה שלהן לעכשיו. הן ימשיכו לבד — אין צורך לעשות כלום.
        </p>
      )}

      {data.reviews.length === 0 ? (
        <EmptyState icon="hub" title="אין הגשות של תוספי שירות" description="כשמפתח יגיש תוסף שירות או עדכון שלו, ההגשה תופיע כאן, ותצטרך לאשר אותה לפני שהבדיקה מתחילה." />
      ) : (
        <>
        <Tabs
          label="ההגשות של תוספי השירות"
          idPrefix={TAB_PREFIX}
          items={SERVICE_TABS.map((t) => {
            const n = groups[t.group].length
            const count = n > 0 ? ` (${n})` : ''
            return { id: t.id, label: `${t.label}${count}`, shortLabel: t.shortLabel ? `${t.shortLabel}${count}` : undefined }
          })}
          value={current}
          onChange={(id: string) => setTab(id as ServiceTab)}
        />

        <div {...tabPanelProps(TAB_PREFIX, current)} className="flex flex-col gap-3 outline-none">
          {TAB_NOTES[current] && reviews.length > 0 && <p className="text-body-sm text-on-surface-variant">{TAB_NOTES[current]}</p>}
          {reviews.length === 0 ? (
            <EmptyState icon={EMPTY[current].icon} title={EMPTY[current].title} description={EMPTY[current].description} as="h3" />
          ) : (
            <ul className="flex flex-col gap-3">
              {reviews.map((review) => (
                <ServiceReviewAdminCard
                  key={review.id}
                  review={review}
                  actions={adminActionsFor(review, rollbackIds)}
                  busyAction={busy?.id === review.id ? busy.action : null}
                  onAction={handleAction}
                />
              ))}
            </ul>
          )}
        </div>

        </>
      )}

      {confirmElement}

      {exceptionFor && (
        <EmergencyExceptionDialog
          pluginName={exceptionFor.pluginName ?? ''}
          busy={busy?.id === exceptionFor.id && busy.action === 'emergency'}
          onClose={() => setExceptionFor(null)}
          onSubmit={async (reason) => {
            const ok = await post(exceptionFor, 'emergency', reason)
            if (ok) {
              setExceptionFor(null)
              toast.show({ tone: 'success', message: 'החריגה אושרה. עכשיו אפשר ללחוץ "אשר והתחל בדיקה" — החריגה תנוצל בתחילת הבדיקה.' })
            }
          }}
        />
      )}
    </div>
  )
}

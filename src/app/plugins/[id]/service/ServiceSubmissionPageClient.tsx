'use client'

import { useState } from 'react'
import Link from 'next/link'
import Section from '@/components/ui/Section'
import Loader from '@/components/ui/Loader'
import StorePageHeader from '@/components/plugins/StorePageHeader'
import { useDialog } from '@/components/providers/DialogContext'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import ServiceCurrentCard from '@/components/plugins/service/ServiceCurrentCard'
import ServiceReviewItem from '@/components/plugins/service/ServiceReviewItem'
import ServiceSubmissionForm from '@/components/plugins/service/form/ServiceSubmissionForm'
import SubmissionErrors from '@/components/plugins/service/form/SubmissionErrors'
import { useServiceSubmission } from '@/components/plugins/service/useServiceSubmission'
import { activeReview, type ManageReview, type SubmissionForm } from '@/components/plugins/service/serviceSubmissionLogic'

/**
 * דף הגשת השירות של תוסף (/plugins/<id>/service) — לבעלים (ולמנהלי תוספים לצפייה). הנתונים רק
 * מ-GET /api/service-plugins/<id>/manage: לפני האישור התוסף עדיין אינו ציבורי.
 */
export default function ServiceSubmissionPageClient({ pluginId }: { pluginId: string }) {
  const { status } = useRequireAuth()
  const { showAlert, showConfirm } = useDialog() as {
    showAlert: (title: string, message: string) => void
    showConfirm: (title: string, message: string, confirmText?: string) => Promise<boolean>
  }
  const svc = useServiceSubmission(pluginId, status === 'authenticated')
  const [busy, setBusy] = useState<string | null>(null)
  const [actionErrors, setActionErrors] = useState<string[]>([])
  const [formKey, setFormKey] = useState(0)

  const manage = svc.load.phase === 'ready' ? svc.load.data : null
  const pluginName = manage?.plugin.name

  const handleSubmit = async (form: SubmissionForm, pluginFile: File) => {
    const ok = await svc.submit(form, pluginFile)
    if (ok) {
      setFormKey((k) => k + 1)
      showAlert('ההגשה נשלחה', 'כל הקבצים התקבלו וההגשה הוקפאה. היא ממתינה כעת לבחירת מנהל; תקבלו הודעה עם תוצאת הבדיקה.')
    }
    return ok
  }

  const handleCancel = async (review: ManageReview) => {
    const confirmed = await showConfirm('ביטול ההגשה', 'לבטל את ההגשה? הקבצים שהועלו לא ישמשו עוד, וכדי להגיש שוב יש להעלות הכול מחדש.', 'בטל הגשה')
    if (!confirmed) return
    setBusy(review.id)
    const errors = await svc.cancelReview(review.id)
    setBusy(null)
    setActionErrors(errors ?? [])
  }

  const handleRollback = async () => {
    const confirmed = await showConfirm(
      'חזרה לגרסה הקודמת',
      'להחזיר בחנות את השירות ואת התוסף הכלול בו לגרסה הקודמת? הפעולה אינה משנה התקנות קיימות אצל משתמשים ואינה מאפסת את 21 הימים.',
      'חזור לגרסה הקודמת'
    )
    if (!confirmed) return
    setBusy('rollback')
    const errors = await svc.rollback()
    setBusy(null)
    setActionErrors(errors ?? [])
    if (!errors) showAlert('בוצע', 'הגרסה הקודמת מוצגת כעת בחנות.')
  }

  const active = manage ? activeReview(manage.reviews) : null
  const isOwner = manage?.viewerIsOwner === true

  return (
    <main id="main-content" className="flex-1">
      <StorePageHeader
        titleId="service-submission-title"
        container="narrow"
        breadcrumbs={[
          { label: 'חנות התוספים', href: '/plugins' },
          ...(pluginName ? [manage?.plugin.isApproved ? { label: pluginName, href: `/plugins/${pluginId}` } : { label: pluginName }] : []),
          { label: 'הגשת שירות' }
        ]}
        title="הגשת שירות"
        subtitle={pluginName
          ? `התוסף "${pluginName}" פועל מול שירות חיצוני. כאן מגישים את המקור, קובץ התוסף והמתקינים, ועוקבים אחרי הבדיקה.`
          : 'מקור, קובץ התוסף ומתקינים לכל מערכת — ומעקב אחרי הבדיקה.'}
      />
      <Section spacing="none" container="narrow" className="pb-14 md:pb-20">
        {(status === 'loading' || svc.load.phase === 'idle' || svc.load.phase === 'loading') && status !== 'unauthenticated' && (
          <Loader size="lg" label="טוען את פרטי ההגשות…" className="mx-auto my-12" />
        )}

        {svc.load.phase === 'error' && <SubmissionErrors title="לא ניתן להציג את הדף" errors={[svc.load.message]} />}

        {manage && (
          <div className="flex flex-col gap-8">
            {!manage.enabled && (
              <SubmissionErrors title="הגשות שירות אינן פעילות כעת" errors={['תוספי השירות כבויים באתר; לא ניתן לשלוח הגשה חדשה.']} />
            )}

            {!isOwner && (
              <p className="rounded-(--card-radius) bg-surface-variant p-4 text-body-md text-on-surface-variant">
                צפייה בלבד: הגשה, ביטול וחזרה לגרסה הקודמת זמינים לבעלי התוסף. כמנהל — פעלו מהלשונית
                {' '}<Link href="/library/admin/plugins?view=service" className="text-primary underline">״תוספי שירות״ בניהול התוספים</Link>.
              </p>
            )}

            <ServiceCurrentCard manage={manage} onRollback={isOwner ? handleRollback : undefined} rollingBack={busy === 'rollback'} />

            <SubmissionErrors title="הפעולה נכשלה" errors={actionErrors} />

            {manage.reviews.length > 0 && (
              <section aria-labelledby="service-reviews-title">
                <h2 id="service-reviews-title" className="mb-4 text-title-lg text-on-surface">{isOwner ? 'ההגשות שלך' : 'ההגשות'}</h2>
                <ul className="flex flex-col gap-3">
                  {manage.reviews.map((review) => (
                    <ServiceReviewItem key={review.id} review={review} onCancel={isOwner ? handleCancel : undefined} cancelling={busy === review.id} />
                  ))}
                </ul>
              </section>
            )}

            {isOwner && manage.enabled && (active ? (
              <p className="text-body-md text-on-surface-variant">
                יש הגשה פעילה. אפשר להגיש חדשה אחרי שתסתיים, או אחרי ביטול שלה (בטיוטה או לפני שמנהל בחר בה).
              </p>
            ) : (
              <section aria-labelledby="service-new-title">
                <h2 id="service-new-title" className="mb-4 text-title-lg text-on-surface">הגשה חדשה</h2>
                <ServiceSubmissionForm
                  key={formKey}
                  manage={manage}
                  submitting={svc.submitting}
                  uploadTasks={svc.uploadTasks}
                  serverErrors={svc.submitErrors}
                  onSubmit={handleSubmit}
                />
              </section>
            ))}
          </div>
        )}
      </Section>
    </main>
  )
}

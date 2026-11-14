'use client'

// חלק הלקוח של דף התוסף. הנתונים מגיעים כ-initialPlugin מה-Server Component
// (page.tsx) — כך שהתוכן נמצא ב-HTML הראשוני ואין קפיצת פריסה אחרי fetch.
// כשהשרת לא רינדר (תוסף מושהה, שדורש בדיקת session; או שגיאת DB זמנית)
// initialPlugin=null, והדף טוען מ-/api/plugins/[id] כמו קודם. תוסף שאינו
// קיים כלל מטופל כבר בשרת (notFound) ולא מגיע לכאן.

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import PluginRatingPanel from '@/components/plugins/PluginRatingPanel'
import { useDialog } from '@/components/providers/DialogContext'
import { useDirectInstall } from '@/components/plugins/useDirectInstall'
import { getErrorMessage } from '@/lib/errors'
import { reloadOnChunkError } from '@/lib/chunkLoadRecovery'
import PluginInstallActions, { canDirectInstall } from '@/components/plugins/PluginInstallActions'
import Breadcrumbs from '@/components/plugins/Breadcrumbs'
import ScreenshotCarousel from '@/components/plugins/detail/ScreenshotCarousel'
import UserText from '@/components/plugins/detail/UserText'
import Section from '@/components/ui/Section'
import Loader from '@/components/ui/Loader'
import DetailSection from '@/components/plugins/detail/DetailSection'
import PluginHero from '@/components/plugins/detail/PluginHero'
import PluginStateBanners from '@/components/plugins/detail/PluginStateBanners'
import PluginSecondaryActions from '@/components/plugins/detail/PluginSecondaryActions'
import PluginInfoList from '@/components/plugins/detail/PluginInfoList'
import PluginTaxonomy from '@/components/plugins/detail/PluginTaxonomy'
import PluginVersionHistory from '@/components/plugins/detail/PluginVersionHistory'
import PluginReportCallout from '@/components/plugins/detail/PluginReportCallout'
import PluginDetailSkeleton from '@/components/plugins/detail/PluginDetailSkeleton'
import ServiceUninstallSection from '@/components/plugins/service/ServiceUninstallSection'
import { buildPluginBreadcrumbs, hasDistinctDescription, ownerPermissions, serviceOwnerActions } from '@/components/plugins/detail/pluginDetailModel'
import type { Plugin } from '@/components/plugins/detail/types'

export type { Plugin } from '@/components/plugins/detail/types'

// חלונות העריכה (למעלה התוסף בלבד) והדיווח נפתחים רק בלחיצה — נטענים
// בנפרד כדי שלא יכבידו על הטעינה הראשונה של כל צופה בדף. בזמן הטעינה מוצגת
// שכבת המתנה (משוב מיידי ללחיצה), וכשל בטעינת ה-chunk (טאב שנפתח לפני דפלוי)
// מרענן את הדף במקום להפיל אותו ל-error boundary.
function ModalLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[calc(var(--z-legacy-modal)_-_1)] flex items-center justify-center bg-scrim/45 p-4">
      <Loader size="lg" tone="current" showLabel={false} className="text-on-scrim" />
    </div>
  )
}
const PluginEditModal = dynamic(
  () => import('@/components/plugins/PluginEditModal').catch(reloadOnChunkError),
  { ssr: false, loading: ModalLoadingOverlay }
)
const PluginReportModal = dynamic(
  () => import('@/components/plugins/PluginReportModal').catch(reloadOnChunkError),
  { ssr: false, loading: ModalLoadingOverlay }
)

interface PluginEditPayload extends Plugin {
  _id: string
  hasPendingUpdate?: boolean
  isApproved?: boolean
  submissionType?: 'new' | 'update'
  imageData?: boolean
  pendingChangeSummary?: Array<{
    field: string
    label: string
    before: string
    after: string
  }>
}

interface PluginDetailClientProps {
  initialPlugin: Plugin | null
}

export default function PluginDetailClient({ initialPlugin }: PluginDetailClientProps) {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { showAlert, showConfirm } = useDialog() as {
    showAlert: (title: string, message: string) => void
    showConfirm: (title: string, message: string) => Promise<boolean>
  }
  const [plugin, setPlugin] = useState<Plugin | null>(initialPlugin)
  const [loading, setLoading] = useState(!initialPlugin)
  const [editingPlugin, setEditingPlugin] = useState<PluginEditPayload | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [reporting, setReporting] = useState(false)
  const { installState, install } = useDirectInstall(showAlert)
  const currentUser = session?.user as { id?: string; role?: string; email?: string | null } | undefined

  useEffect(() => {
    if (initialPlugin) {
      // התוכן כבר רונדר בשרת, אבל ב-Back/Forward ה-Router Cache של Next משחזר
      // את ה-props הישנים (לפני השהיה/עריכה בדף הזה או שינוי חיצוני). רענון
      // ברקע מה-API — אותה בקשה אחת שהדף שלח בכל טעינה לפני רינדור-השרת —
      // בלי ספינר. תוסף שכבר אינו נגיש (404) מפנה ל-/plugins כמו קודם; שגיאה
      // אחרת משאירה את התוכן שרונדר.
      let cancelled = false
      fetch(`/api/plugins/${params.id}`)
        .then(async (response) => {
          if (cancelled) return
          if (response.status === 404) {
            router.push('/plugins')
            return
          }
          if (!response.ok) return
          const data = await response.json()
          if (!cancelled) setPlugin(data)
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }
    const loadPlugin = async () => {
      try {
        const response = await fetch(`/api/plugins/${params.id}`)
        if (!response.ok) {
          router.push('/plugins')
          return
        }
        
        const data = await response.json()
        setPlugin(data)
      } catch (error) {
        console.error('Error loading plugin:', error)
        router.push('/plugins')
      } finally {
        setLoading(false)
      }
    }
    loadPlugin()
  }, [params.id, router, initialPlugin])

  const handleDirectInstall = (downloadUrl?: string) => {
    if (plugin && canDirectInstall(plugin)) {
      install(downloadUrl ? { ...plugin, downloadUrl } : plugin)
    }
  }

  if (loading) {
    return <PluginDetailSkeleton />
  }

  if (!plugin) {
    return null
  }

  // עריכה והשהיה מדף התוסף — למעלה התוסף בלבד, ורק על הגרסה החיה. מנהל משהה ומחזיר מממשק
  // הניהול (/library/admin/plugins) ולא מכאן; תוסף שהושהה בניהול — רק מנהל מחזיר.
  const { canEdit, suspendedByAdmin, showSuspendToggle } = ownerPermissions(plugin, currentUser?.id)
  const { showEdit, serviceUrl } = serviceOwnerActions(plugin, canEdit)

  const handleToggleSuspend = async () => {
    const suspend = plugin.isSuspended !== true
    const confirmed = await showConfirm(
      suspend ? 'השהיית התוסף מהחנות' : 'החזרת התוסף לחנות',
      suspend
        ? `האם להשהות את התוסף "${plugin.name}" מהחנות?\n\n` +
          'לאחר ההשהיה התוסף לא יופיע בחנות ולא בחיפוש, ולא ניתן יהיה להוריד או להתקין אותו. ' +
          'גם בקישור ישיר לא תהיה אליו גישה — למעט עבורך (המעלה) ועבור מנהלי האתר. ' +
          'ניתן להחזיר את התוסף לחנות בכל עת מדף זה.'
        : `להחזיר את התוסף "${plugin.name}" לחנות? התוסף יופיע שוב בחנות ויהיה זמין להורדה ולהתקנה.`
    )
    if (!confirmed) return

    try {
      setSuspending(true)
      const response = await fetch(`/api/plugins/${plugin.id}/suspend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: suspend ? 'suspend' : 'resume' })
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'הפעולה נכשלה')
      }

      await showAlert(suspend ? 'התוסף הושהה' : 'התוסף חזר לחנות', result.message)
      const refreshed = await fetch(`/api/plugins/${plugin.id}`)
      if (refreshed.ok) {
        setPlugin(await refreshed.json())
      }
    } catch (error: unknown) {
      showAlert('שגיאה', getErrorMessage(error, 'לא הצלחנו לעדכן את מצב ההשהיה'))
    } finally {
      setSuspending(false)
    }
  }

  const handleEdit = async () => {
    try {
      setLoadingEdit(true)
      const response = await fetch(`/api/plugins/${plugin.id}/edit`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'לא ניתן לטעון את חלון העריכה')
      }
      // תוסף שירות: העריכה הישירה חסומה — שינוי רק דרך הגשה חדשה
      if (result.editBlocked) {
        router.push(`/plugins/${plugin.id}/service`)
        return
      }

      setEditingPlugin({
        ...result,
        _id: result.id
      })
    } catch (error: unknown) {
      showAlert('שגיאה', getErrorMessage(error, 'לא ניתן לטעון את חלון העריכה'))
    } finally {
      setLoadingEdit(false)
    }
  }

  const titleId = 'plugin-title'
  const showDescription = hasDistinctDescription(plugin)
  const screenshots = plugin.screenshots || []
  const versions = plugin.versions || []

  return (
    <div className="flex flex-1 flex-col">
      <main id="main-content" className="flex-1">
        {/* ראש העמוד — מעל הקפל: שם, תיאור קצר, הורדה/התקנה ונתוני המפתח (S13) */}
        <Section labelledBy={titleId} spacing="none" className="pt-4 md:pt-6">
          <Breadcrumbs items={buildPluginBreadcrumbs(plugin)} className="mb-3 md:mb-4" />

          <PluginStateBanners
            plugin={plugin}
            canEdit={canEdit}
            suspendedByAdmin={suspendedByAdmin}
            className="mb-6"
          />

          <PluginHero
            plugin={plugin}
            titleId={titleId}
            media={screenshots.length > 0 ? <ScreenshotCarousel screenshots={screenshots} /> : undefined}
            actions={
              <PluginInstallActions
                // גרסה ישנה של תוסף שירות: הורדה מפורשת של קובץ התוסף בלבד (עם באנר "גרסה ישנה"), בלי מתקינים
                plugin={plugin.hasService && plugin.isHistoricalVersion ? { ...plugin, hasService: false, supportsDirectInstall: false } : plugin}
                installState={installState}
                onInstall={handleDirectInstall}
                emphasis="page"
                installLabel="התקנה ישירה לאוצריא"
                className="sm:w-fit"
              />
            }
            secondaryActions={
              <PluginSecondaryActions
                homepage={plugin.homepage}
                onReport={() => setReporting(true)}
                canEdit={showEdit}
                serviceUrl={serviceUrl}
                loadingEdit={loadingEdit}
                onEdit={handleEdit}
                showSuspendToggle={showSuspendToggle}
                isSuspended={plugin.isSuspended === true}
                suspending={suspending}
                onToggleSuspend={handleToggleSuspend}
              />
            }
          />
        </Section>

        {/* הפרטים — אזורים עם כותרות, ברווח אחד קבוע ביניהם (S11) */}
        <Section spacing="none" className="pt-12 pb-14 md:pt-16 md:pb-20">
          <div className="flex flex-col gap-12 md:gap-16">
            <div
              className={
                showDescription
                  ? 'grid gap-12 md:gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12'
                  : 'grid gap-12 md:gap-16 lg:grid-cols-2 lg:gap-12'
              }
            >
              {showDescription && (
                <DetailSection id="plugin-description" title="תיאור">
                  {/* שורה = בלוק עם dir="auto"; ירידות השורה שהמפתח הזין נשמרות (issue #175) — UserText */}
                  <UserText text={plugin.description} className="max-w-measure text-body-md text-on-surface md:text-body-lg" />
                </DetailSection>
              )}

              <DetailSection id="plugin-info" title="מידע כללי">
                <PluginInfoList plugin={plugin} />
                <PluginTaxonomy categories={plugin.categories} tags={plugin.tags} className="mt-6" />
              </DetailSection>
            </div>

            {/* דירוגים — הדירוג הוא של התוסף כולו, ולכן אינו מוצג בתצוגת גרסה ישנה */}
            {!plugin.isHistoricalVersion && (
              <DetailSection id="plugin-ratings" title="דירוג המשתמשים">
                <PluginRatingPanel
                  pluginId={plugin.id}
                  initial={{
                    ratingAvg: plugin.ratingAvg || 0,
                    ratingCount: plugin.ratingCount || 0,
                    ratingVerifiedCount: plugin.ratingVerifiedCount || 0,
                    ratingBreakdown: plugin.ratingBreakdown || [0, 0, 0, 0, 0]
                  }}
                />
              </DetailSection>
            )}

            {plugin.hasService && !plugin.isHistoricalVersion && <ServiceUninstallSection pluginId={plugin.id} />}

            {versions.length > 1 && (
              <DetailSection id="plugin-versions" title="היסטוריית גרסאות">
                <PluginVersionHistory pluginId={plugin.id} versions={versions} currentVersion={plugin.version} />
              </DetailSection>
            )}

            <PluginReportCallout onReport={() => setReporting(true)} />
          </div>
        </Section>
      </main>

      {reporting && (
        <PluginReportModal
          plugin={plugin}
          defaultEmail={currentUser?.email || null}
          onClose={() => setReporting(false)}
          onSuccess={(duplicate) => {
            setReporting(false)
            showAlert(
              'הדיווח נשלח',
              duplicate
                ? 'דיווח זהה כבר התקבל בעבר על תוסף זה, ולכן לא נשלח שוב למפתח.'
                : 'תודה! הדיווח הועבר למפתח התוסף.'
            )
          }}
        />
      )}

      {editingPlugin && (
        <PluginEditModal
          plugin={editingPlugin}
          endpoint={`/api/plugins/${editingPlugin._id}/edit`}
          onClose={() => setEditingPlugin(null)}
          onSuccess={async (result: { message?: string }) => {
            setEditingPlugin(null)
            await showAlert('הצלחה', result?.message || 'השינויים נשמרו בהצלחה.')
            const refreshed = await fetch(`/api/plugins/${params.id}`)
            if (refreshed.ok) {
              const data = await refreshed.json()
              setPlugin(data)
            }
          }}
        />
      )}
    </div>
  )
}

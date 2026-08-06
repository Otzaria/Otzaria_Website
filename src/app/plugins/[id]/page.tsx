'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import PluginEditModal from '@/components/plugins/PluginEditModal'
import { useDialog } from '@/components/providers/DialogContext'
import { useDirectInstall } from '@/components/plugins/useDirectInstall'
import { formatPluginStatus } from '@/lib/pluginSubmission'
import { formatHebrewDate } from '@/lib/hebrewDate'
import type { CategoryRef } from '@/components/plugins/types'

interface Plugin {
  id: string
  name: string
  shortDescription: string
  description: string
  version: string
  status: 'stable' | 'beta' | 'experimental'
  author: string
  updatedAt: string
  originalDate?: string
  compatibleWith: string
  requiresNetwork?: boolean
  tags: string[]
  image: string
  screenshots: string[]
  downloadUrl: string
  supportsDirectInstall: boolean
  homepage: string
  authorId?: string | null
  downloadCount?: number
  isHistoricalVersion?: boolean
  latestVersion?: string
  // הקטגוריות שהתוסף משובץ בהן (מוחזר מ-GET /api/plugins/[id])
  categories?: CategoryRef[]
}

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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export default function PluginDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { showAlert } = useDialog() as { showAlert: (title: string, message: string) => void }
  const [plugin, setPlugin] = useState<Plugin | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingPlugin, setEditingPlugin] = useState<PluginEditPayload | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const { installState, install } = useDirectInstall()

  // הודעת דיאלוג רגילה של האתר כשמגיע דיווח תוצאה מאוצריא
  useEffect(() => {
    if (installState.phase === 'success') {
      showAlert('הצלחה', 'התוסף הותקן בהצלחה באוצריא!')
    } else if (installState.phase === 'failure') {
      showAlert(
        'שגיאה',
        installState.error
          ? `ההתקנה נכשלה: ${installState.error}`
          : 'ההתקנה נכשלה. אפשר לנסות שוב או להוריד את הקובץ ולהתקין ידנית.'
      )
    } else if (installState.phase === 'no_app') {
      showAlert(
        'אוצריא לא נמצאה',
        'נראה שאוצריא אינה מותקנת במחשב זה — בקשת ההתקנה לא הגיעה לתוכנה. ניתן להוריד את אוצריא מהאתר, או להוריד את קובץ התוסף ולהתקינו ידנית.'
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installState])
  const currentUser = session?.user as { id?: string; role?: string } | undefined

  useEffect(() => {
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
  }, [params.id, router])

  const screenshotCount = plugin?.screenshots?.length ?? 0
  const handleLightboxKey = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return
    if (e.key === 'Escape') setLightboxIndex(null)
    if (e.key === 'ArrowRight') setLightboxIndex(cur => cur !== null && cur > 0 ? cur - 1 : screenshotCount - 1)
    if (e.key === 'ArrowLeft') setLightboxIndex(cur => cur !== null && cur < screenshotCount - 1 ? cur + 1 : 0)
  }, [lightboxIndex, screenshotCount])

  useEffect(() => {
    window.addEventListener('keydown', handleLightboxKey)
    return () => window.removeEventListener('keydown', handleLightboxKey)
  }, [handleLightboxKey])

  const canDirectInstall = (plugin: Plugin) => {
    return Boolean(plugin.supportsDirectInstall && plugin.downloadUrl)
  }

  const handleDirectInstall = () => {
    if (plugin && canDirectInstall(plugin)) {
      install(plugin)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-on-surface/50 font-medium">טוען פרטי תוסף...</p>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    )
  }

  if (!plugin) {
    return null
  }

  const canEdit = Boolean(currentUser && currentUser.id === plugin.authorId && !plugin.isHistoricalVersion)

  const handleEdit = async () => {
    try {
      setLoadingEdit(true)
      const response = await fetch(`/api/plugins/${plugin.id}/edit`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'לא ניתן לטעון את חלון העריכה')
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader />
      
      <main className="flex-1 py-8 px-4">
        <div className="container mx-auto max-w-5xl">
          {/* פירורי לחם: חנות התוספים ‹ קטגוריה ראשונה (אם משובץ) ‹ שם התוסף */}
          <nav className="flex flex-wrap items-center gap-2 text-sm text-on-surface/60 mb-3" aria-label="פירורי לחם">
            <Link href="/plugins" className="text-primary hover:underline font-medium">
              חנות התוספים
            </Link>
            {plugin.categories && plugin.categories.length > 0 && (
              <>
                <span aria-hidden="true">‹</span>
                <Link
                  href={`/plugins/category/${plugin.categories[0].slug}`}
                  className="text-primary hover:underline font-medium"
                >
                  {plugin.categories[0].name}
                </Link>
              </>
            )}
            <span aria-hidden="true">‹</span>
            <span className="font-bold text-on-surface">{plugin.name}</span>
          </nav>

          {/* Back Button */}
          <Link
            href="/plugins"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-6 font-medium"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
            <span>חזרה לחנות</span>
          </Link>

          {/* Historical Version Banner */}
          {plugin.isHistoricalVersion && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning-200 bg-warning-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-warning-700">history</span>
                <div>
                  <div className="font-bold text-warning-900">
                    גרסה ישנה ({plugin.version})
                  </div>
                  <div className="text-sm text-warning-800/80">
                    אתה צופה בגרסה קודמת של התוסף.
                    {plugin.latestVersion && plugin.latestVersion !== plugin.version
                      ? ` הגרסה העדכנית היא ${plugin.latestVersion}.`
                      : ''}
                  </div>
                </div>
              </div>
              <Link
                href={`/plugins/${plugin.id}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-warning-600 px-5 py-2.5 font-bold text-white transition-colors hover:bg-warning-700"
              >
                <span className="material-symbols-outlined">upgrade</span>
                <span>עבור לגרסה העדכנית</span>
              </Link>
            </div>
          )}

          {/* Plugin Header */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-8 mb-6">
            <div className="grid md:grid-cols-[380px_1fr] gap-8">
              {/* Plugin Image */}
              <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-primary/5 to-secondary/5 aspect-[4/3]">
                <img
                  src={plugin.image || '/logo.svg'}
                  alt={plugin.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Plugin Info */}
              <div className="flex flex-col gap-4">
                <div>
                  <h1 className="text-4xl font-bold text-on-surface mb-3 font-frank leading-tight">
                    {plugin.name}
                  </h1>
                  <p className="text-lg text-on-surface/70 leading-relaxed">
                    {plugin.description}
                  </p>
                </div>

                {/* Status & Version */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                    plugin.status === 'stable' ? 'bg-primary/10 text-primary' :
                    plugin.status === 'beta' ? 'bg-primary/15 text-primary' :
                    'bg-primary/20 text-primary'
                  }`}>
                    {formatPluginStatus(plugin.status)}
                  </span>
                  <span className="px-4 py-2 rounded-full text-sm font-bold bg-surface text-on-surface/60">
                    גרסה {plugin.version}
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-surface text-on-surface/60"
                    title="מספר הורדות"
                  >
                    <span className="material-symbols-outlined text-base leading-none">download</span>
                    {(plugin.downloadCount || 0).toLocaleString('he-IL')} הורדות
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href={plugin.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg hover:shadow-xl"
                  >
                    <span className="material-symbols-outlined">download</span>
                    <span>הורדה</span>
                  </a>
                  {canDirectInstall(plugin) && (
                    <button
                      onClick={handleDirectInstall}
                      disabled={installState.phase === 'waiting'}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-primary text-primary rounded-xl font-bold hover:bg-primary/5 transition-colors disabled:cursor-default disabled:opacity-80"
                    >
                      {installState.phase === 'waiting' ? (
                        <>
                          <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                          <span>מתקין...</span>
                        </>
                      ) : installState.phase === 'success' ? (
                        <>
                          <span className="material-symbols-outlined">check_circle</span>
                          <span>הותקן בהצלחה!</span>
                        </>
                      ) : installState.phase === 'failure' ? (
                        <>
                          <span className="material-symbols-outlined">error</span>
                          <span>ההתקנה נכשלה - לחץ שוב לנסיון נוסף</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">install_desktop</span>
                          <span>התקנה ישירה לאוצריא</span>
                        </>
                      )}
                    </button>
                  )}
                  {plugin.homepage && (
                    <a
                      href={plugin.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-neutral-200 text-on-surface rounded-xl font-medium hover:border-primary/30 transition-colors"
                    >
                      <span className="material-symbols-outlined">open_in_new</span>
                      <span>מקור</span>
                    </a>
                  )}
                  {canEdit && (
                    <button
                      onClick={handleEdit}
                      disabled={loadingEdit}
                      className="inline-flex items-center gap-2 rounded-xl bg-neutral-warm-700 px-6 py-3 font-medium text-white transition-colors hover:bg-neutral-warm-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined">edit</span>
                      <span>{loadingEdit ? 'טוען...' : 'ערוך'}</span>
                    </button>
                  )}
                </div>

                {/* קטגוריות שהתוסף משובץ בהן — צ'יפים מקושרים */}
                {plugin.categories && plugin.categories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-sm font-bold text-on-surface/50">מופיע בקטגוריות:</span>
                    {plugin.categories.map(category => (
                      <Link
                        key={category.slug}
                        href={`/plugins/category/${category.slug}`}
                        className="px-3 py-1.5 bg-primary/5 border border-primary/15 rounded-full text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        {category.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Plugin Details Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Info Section */}
            <div className="bg-white rounded-2xl border border-neutral-100 p-6">
              <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">info</span>
                <span>מידע כללי</span>
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-surface rounded-xl">
                  <div className="text-sm text-on-surface/60 mb-1">גרסה</div>
                  <div className="font-bold text-on-surface">{plugin.version}</div>
                </div>
                <div className="p-4 bg-surface rounded-xl">
                  <div className="text-sm text-on-surface/60 mb-1">סטטוס</div>
                  <div className="font-bold text-on-surface">{formatPluginStatus(plugin.status)}</div>
                </div>
                <div className="p-4 bg-surface rounded-xl">
                  <div className="text-sm text-on-surface/60 mb-1">מפתח</div>
                  <div className="font-bold text-on-surface">{plugin.author}</div>
                </div>
                <div className="p-4 bg-surface rounded-xl">
                  <div className="text-sm text-on-surface/60 mb-1">עודכן</div>
                  <div className="font-bold text-on-surface text-sm">{formatHebrewDate(plugin.originalDate || plugin.updatedAt)}</div>
                </div>
                <div className="p-4 bg-surface rounded-xl col-span-2">
                  <div className="text-sm text-on-surface/60 mb-1">הורדות</div>
                  <div className="font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">download</span>
                    <span>{(plugin.downloadCount || 0).toLocaleString('he-IL')}</span>
                  </div>
                </div>
                <div className="p-4 bg-surface rounded-xl col-span-2">
                  <div className="text-sm text-on-surface/60 mb-1">תאימות</div>
                  <div className="font-bold text-on-surface">{plugin.compatibleWith}</div>
                </div>
                <div className="p-4 bg-surface rounded-xl col-span-2">
                  <div className="text-sm text-on-surface/60 mb-1">חיבור אינטרנט</div>
                  <div className="font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">
                      {plugin.requiresNetwork ? 'wifi' : 'wifi_off'}
                    </span>
                    <span>{plugin.requiresNetwork ? 'נדרש' : 'לא נדרש'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags Section */}
            <div className="bg-white rounded-2xl border border-neutral-100 p-6">
              <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">label</span>
                <span>תגיות</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {plugin.tags?.map(tag => (
                  <Link
                    key={tag}
                    href={`/plugins?tag=${encodeURIComponent(tag)}`}
                    className="px-4 py-2 bg-surface hover:bg-primary/10 rounded-full text-sm font-medium text-on-surface/70 hover:text-primary transition-colors"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Screenshots Gallery */}
          {plugin.screenshots?.length > 0 && (
            <div className="bg-white rounded-2xl border border-neutral-100 p-6 mt-6">
              <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">photo_library</span>
                <span>צילומי מסך</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {plugin.screenshots.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxIndex(i)}
                    className="aspect-video rounded-xl overflow-hidden bg-surface hover:ring-2 hover:ring-primary/40 transition-all focus:outline-none focus:ring-2 focus:ring-primary/60"
                  >
                    <img
                      src={src}
                      alt={`צילום מסך ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && plugin.screenshots?.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={e => { e.stopPropagation(); setLightboxIndex(cur => cur !== null && cur > 0 ? cur - 1 : plugin.screenshots.length - 1) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="הקודם"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <img
            src={plugin.screenshots[lightboxIndex]}
            alt={`צילום מסך ${lightboxIndex + 1}`}
            className="max-h-[85vh] max-w-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={e => { e.stopPropagation(); setLightboxIndex(cur => cur !== null && cur < plugin.screenshots.length - 1 ? cur + 1 : 0) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="הבא"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="סגור"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightboxIndex + 1} / {plugin.screenshots.length}
          </div>
        </div>
      )}

      <OtzariaSoftwareFooter />

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

'use client'

// דף הבית האצוּר של חנות התוספים (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.1):
// hero עם חיפוש, סרגל-צד קטגוריות (דסקטופ) / סרגל צ'יפים אופקי (מובייל),
// "תוספים נבחרים", שורות קטגוריה נבחרות ופס גילוי אל "כל התוספים".
// הכול מקריאה אחת ל-/api/plugins/store-home.
// קישורים ישנים ?tag= מנותבים אל /plugins/all?tag= (תאימות לאחור).

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { useDirectInstall } from '@/components/plugins/useDirectInstall'
import { useDialog } from '@/components/providers/DialogContext'
import PluginCard from '@/components/plugins/PluginCard'
import PluginSearchBox from '@/components/plugins/PluginSearchBox'
import type { Plugin, PluginCategorySummary } from '@/components/plugins/types'

const DEFAULT_HOME_TITLE = 'חנות התוספים של אוצריא'
const DEFAULT_HOME_SUBTITLE = 'תוספים שמרחיבים את חוויית הלימוד באוצריא — מצאו, הורידו והתקינו בלחיצה אחת'
const FEATURED_PREVIEW_COUNT = 6

interface StoreHomeCategory extends PluginCategorySummary {
  showOnHome: boolean
  plugins: Plugin[]
}

interface StoreHomeData {
  settings: { homeTitle: string; homeSubtitle: string }
  featured: Plugin[]
  categories: StoreHomeCategory[]
  totalPublicPlugins: number
}

// שלד טעינה — בלוקים אפורים מהבהבים בגובה כרטיס (לא רק ספינר)
function StoreHomeSkeleton() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-12 animate-pulse">
      <div className="mx-auto max-w-2xl">
        <div className="h-10 bg-neutral-200 rounded-xl w-2/3 mx-auto mb-4"></div>
        <div className="h-5 bg-neutral-200 rounded-lg w-full mb-8"></div>
        <div className="h-14 bg-neutral-200 rounded-2xl w-full mb-12"></div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-96 bg-neutral-200 rounded-2xl"></div>
        ))}
      </div>
    </div>
  )
}

function PluginsStoreHomeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const legacyTag = searchParams.get('tag')
  const [data, setData] = useState<StoreHomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showAllFeatured, setShowAllFeatured] = useState(false)
  const { installState, install } = useDirectInstall()
  const { showAlert } = useDialog() as { showAlert: (title: string, message: string) => void }

  // תאימות לקישורים ישנים: /plugins?tag=X → /plugins/all?tag=X
  useEffect(() => {
    if (legacyTag) {
      router.replace(`/plugins/all?tag=${encodeURIComponent(legacyTag)}`)
    }
  }, [legacyTag, router])

  // הודעת דיאלוג רגילה של האתר כשמגיע דיווח תוצאה מאוצריא
  useEffect(() => {
    if (installState.phase === 'success') {
      showAlert('הצלחה', installState.updated ? 'התוסף עודכן בהצלחה באוצריא!' : 'התוסף הותקן בהצלחה באוצריא!')
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

  // טעינת דף הבית בקריאה אחת
  useEffect(() => {
    if (legacyTag) return
    const loadHome = async () => {
      try {
        const response = await fetch('/api/plugins/store-home')
        if (!response.ok) throw new Error('Failed to load store home')
        setData(await response.json())
      } catch (error) {
        console.error('Error loading store home:', error)
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    loadHome()
  }, [legacyTag])

  // בזמן הפניית תאימות או טעינה — שלד
  if (legacyTag || loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader showAuth />
        <main className="flex-1">
          <StoreHomeSkeleton />
        </main>
        <OtzariaSoftwareFooter />
      </div>
    )
  }

  const featured = data?.featured || []
  const categories = data?.categories || []
  const homeCategories = categories.filter(c => c.showOnHome && c.plugins.length > 0)
  const totalPublicPlugins = data?.totalPublicPlugins || 0
  const homeTitle = data?.settings.homeTitle || DEFAULT_HOME_TITLE
  const homeSubtitle = data?.settings.homeSubtitle || DEFAULT_HOME_SUBTITLE
  const isEmptyHome = featured.length === 0 && homeCategories.length === 0
  const visibleFeatured = showAllFeatured ? featured : featured.slice(0, FEATURED_PREVIEW_COUNT)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader showAuth />

      <main className="flex-1">
        {/* Hero קומפקטי: כותרת + חיפוש בולט + העלאת תוסף */}
        <section className="bg-white border-b border-neutral-100 py-12 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-primary font-frank mb-4 leading-tight">
                {homeTitle}
              </h1>
              <p className="text-lg text-on-surface/70 leading-relaxed mb-8">
                {homeSubtitle}
              </p>
              <PluginSearchBox size="lg" placeholder="חפשו תוסף לפי שם, תיאור או נושא..." />
              <div className="mt-5 flex items-center justify-center gap-4">
                <Link
                  href="/plugins/upload" prefetch={false}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-primary/20 text-primary rounded-xl font-bold hover:bg-primary/5 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>העלה תוסף חדש</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* סרגל קטגוריות אופקי — מובייל/טאבלט בלבד (בדסקטופ יש סרגל צד) */}
        {!loadError && categories.length > 0 && (
          <nav
            aria-label="קטגוריות"
            className="lg:hidden bg-white border-b border-neutral-100 px-4 py-3"
          >
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
              {categories.map(category => (
                <Link
                  key={category.id}
                  href={`/plugins/category/${category.slug}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-on-surface/70 hover:border-primary/30 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-base">{category.icon || 'extension'}</span>
                  <span>{category.name}</span>
                  <span className="text-xs text-on-surface/40">({category.pluginCount})</span>
                </Link>
              ))}
              {/* "כל התוספים" — מוצא אחרון, מוצנע בסוף השורה */}
              <Link
                href="/plugins/all"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-4 py-2 text-sm text-on-surface/50 hover:text-primary hover:border-primary/30 transition-colors"
              >
                <span>כל התוספים ({totalPublicPlugins})</span>
              </Link>
            </div>
          </nav>
        )}

        <div className="container mx-auto max-w-7xl px-4 py-10">
          <div className="flex items-start gap-8">
            {/* סרגל צד קטגוריות — דסקטופ, דביק, נגיש בלי לגלול */}
            {!loadError && categories.length > 0 && (
              <aside className="hidden lg:block w-64 shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
                <nav aria-label="קטגוריות" className="bg-white rounded-2xl border border-neutral-100 p-4">
                  <h2 className="text-sm font-bold text-on-surface/60 mb-3 px-2">קטגוריות</h2>
                  <ul className="space-y-1">
                    {categories.map(category => (
                      <li key={category.id}>
                        <Link
                          href={`/plugins/category/${category.slug}`}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium text-on-surface/80 hover:bg-primary/5 hover:text-primary transition-colors group"
                        >
                          <span className="material-symbols-outlined text-xl shrink-0 text-primary/60 group-hover:text-primary">
                            {category.icon || 'extension'}
                          </span>
                          <span className="flex-1 truncate">{category.name}</span>
                          <span className="text-xs text-on-surface/40">{category.pluginCount}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {/* "כל התוספים" — מוצא אחרון, מוצנע בתחתית הסרגל */}
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    <Link
                      href="/plugins/all"
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-on-surface/50 hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                      <span className="flex-1 truncate">כל התוספים</span>
                      <span className="text-xs text-on-surface/40">{totalPublicPlugins}</span>
                    </Link>
                  </div>
                </nav>
              </aside>
            )}

            {/* התוכן הראשי */}
            <div className="flex-1 min-w-0">
              {loadError ? (
                // שגיאת טעינה — עדיין מציעים דרך אל כל התוספים
                <div className="mx-auto max-w-2xl text-center bg-white rounded-2xl border border-neutral-100 py-16 px-6">
                  <h2 className="text-2xl font-bold text-on-surface mb-3">אירעה שגיאה בטעינת החנות</h2>
                  <p className="text-on-surface/60 leading-relaxed mb-6">
                    נסו לרענן את הדף, או עברו לרשימת כל התוספים.
                  </p>
                  <Link
                    href="/plugins/all"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  >
                    <span>לכל התוספים</span>
                    <span aria-hidden="true">←</span>
                  </Link>
                </div>
              ) : isEmptyHome ? (
                // מצב ריק כללי (7.1.6): אין נבחרים ואין קטגוריות בית — שער לכל התוספים
                <div className="mx-auto max-w-2xl text-center bg-white rounded-2xl border border-neutral-100 py-16 px-6">
                  <span className="material-symbols-outlined text-5xl text-primary/40 mb-4 inline-block">extension</span>
                  <h2 className="text-2xl font-bold text-on-surface mb-3">החנות בבנייה — אבל התוספים כבר כאן</h2>
                  <p className="text-on-surface/60 leading-relaxed mb-6">
                    בקרוב יופיעו כאן תוספים נבחרים וקטגוריות מסודרות. בינתיים אפשר לחפש למעלה
                    או לעיין ברשימה המלאה של כל התוספים.
                  </p>
                  <Link
                    href="/plugins/all"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-md hover:shadow-lg"
                  >
                    <span>לכל התוספים ({totalPublicPlugins})</span>
                    <span aria-hidden="true">←</span>
                  </Link>
                </div>
              ) : (
                <>
                  {/* תוספים נבחרים */}
                  {featured.length > 0 && (
                    <section>
                      <div className="inline-flex items-center gap-2 text-primary/70 text-sm font-bold mb-2">
                        <div className="w-7 h-px bg-primary/30"></div>
                        <span>מומלצי החנות</span>
                      </div>
                      <h2 className="text-3xl font-bold text-on-surface mb-6">תוספים נבחרים</h2>
                      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {visibleFeatured.map(plugin => (
                          <PluginCard
                            key={plugin.id}
                            plugin={plugin}
                            installState={installState}
                            onInstall={install}
                          />
                        ))}
                      </div>
                      {featured.length > FEATURED_PREVIEW_COUNT && !showAllFeatured && (
                        <div className="mt-6 text-center">
                          <button
                            onClick={() => setShowAllFeatured(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-primary/20 text-primary rounded-xl font-bold hover:bg-primary/5 transition-colors"
                          >
                            הצג עוד נבחרים
                          </button>
                        </div>
                      )}
                    </section>
                  )}

                  {/* שורות קטגוריה של דף הבית */}
                  {homeCategories.map((category, index) => (
                    <section
                      key={category.id}
                      className={`${featured.length > 0 || index > 0 ? 'mt-10 pt-10 border-t border-neutral-200' : ''}`}
                    >
                      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            {category.icon && (
                              <span className="material-symbols-outlined text-3xl text-primary">
                                {category.icon}
                              </span>
                            )}
                            <h2 className="text-2xl font-bold text-on-surface">{category.name}</h2>
                          </div>
                          {category.description && (
                            <p className="text-on-surface/60">{category.description}</p>
                          )}
                        </div>
                        <Link
                          href={`/plugins/category/${category.slug}`}
                          className="text-sm font-bold text-primary hover:underline whitespace-nowrap"
                        >
                          לכל הקטגוריה ({category.pluginCount}) ←
                        </Link>
                      </div>

                      {/* גלילה אופקית במובייל / גריד בדסקטופ */}
                      <div className="flex gap-6 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:overflow-visible">
                        {category.plugins.map(plugin => (
                          <div key={plugin.id} className="w-[300px] shrink-0 md:w-auto">
                            <PluginCard
                              plugin={plugin}
                              installState={installState}
                              onInstall={install}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}

                  {/* פס גילוי מלא — כל התוספים */}
                  <div className="mt-12 pt-8 border-t border-neutral-200">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
                      <p className="text-on-surface/70 text-lg">
                        לא מצאתם את מה שחיפשתם?
                      </p>
                      <Link
                        href="/plugins/all"
                        className="inline-flex items-center gap-2 text-lg font-bold text-primary hover:underline"
                      >
                        <span>עיינו בכל התוספים ({totalPublicPlugins})</span>
                        <span aria-hidden="true">←</span>
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}

export default function PluginsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader showAuth />
        <main className="flex-1">
          <StoreHomeSkeleton />
        </main>
        <OtzariaSoftwareFooter />
      </div>
    }>
      <PluginsStoreHomeContent />
    </Suspense>
  )
}

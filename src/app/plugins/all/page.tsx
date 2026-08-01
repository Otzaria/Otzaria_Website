'use client'

// דף "כל התוספים" — הרשימה השטוחה המלאה עם סינון מקומי (חיפוש/סטטוס/תגית).
// זהו בפועל דף החנות הקודם בהעברה (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.2):
// תיבת החיפוש הוחלפה ב-PluginSearchBox (הצעות חיות מהשרת; Enter בלי בחירה →
// סינון מקומי), ומצב הסינון נשמר ב-URL (?q=&tag=&status=) לקישורים שיתופיים.

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { useDirectInstall } from '@/components/plugins/useDirectInstall'
import { useDialog } from '@/components/providers/DialogContext'
import PluginCard from '@/components/plugins/PluginCard'
import PluginSearchBox from '@/components/plugins/PluginSearchBox'
import type { Plugin } from '@/components/plugins/types'

function AllPluginsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [filteredPlugins, setFilteredPlugins] = useState<Plugin[]>([])
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all')
  const [activeTag, setActiveTag] = useState(() => searchParams.get('tag') || 'all')
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const tagsContainerRef = useRef<HTMLDivElement>(null)
  const [showAllTags, setShowAllTags] = useState(false)
  const [tagsCollapsedHeight, setTagsCollapsedHeight] = useState(130)
  const [tagsFullHeight, setTagsFullHeight] = useState(0)
  const [tagsOverflow, setTagsOverflow] = useState(false)
  const { installState, install } = useDirectInstall()
  const { showAlert } = useDialog() as { showAlert: (title: string, message: string) => void }

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

  // טעינת נתוני התוספים
  useEffect(() => {
    const loadPlugins = async () => {
      try {
        const response = await fetch('/api/plugins')
        if (!response.ok) throw new Error('Failed to load plugins')
        const data = await response.json()
        setPlugins(data)
        setFilteredPlugins(data)

        // חילוץ כל התגיות
        const tags = new Set<string>()
        data.forEach((plugin: Plugin) => {
          plugin.tags?.forEach(tag => tags.add(tag))
        })
        setAllTags(Array.from(tags).sort((a, b) => a.localeCompare(b, 'he')))
      } catch (error) {
        console.error('Error loading plugins:', error)
      } finally {
        setLoading(false)
      }
    }
    loadPlugins()
  }, [])

  // שימור מצב הסינון ב-URL — קישורים שיתופיים (?q=&tag=&status=)
  useEffect(() => {
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    if (activeTag !== 'all') params.set('tag', activeTag)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const next = params.toString()
    if (next !== searchParams.toString()) {
      router.replace(next ? `/plugins/all?${next}` : '/plugins/all', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeTag, statusFilter])

  // מדידת גובה אזור התגיות - הגבלה ל-3 שורות עם כפתור "הצג עוד"
  useEffect(() => {
    const el = tagsContainerRef.current
    if (!el || !el.firstElementChild) return
    const measure = () => {
      const rowHeight = (el.firstElementChild as HTMLElement).offsetHeight
      const gap = 8 // gap-2
      const threeLines = rowHeight * 3 + gap * 2
      setTagsCollapsedHeight(threeLines)
      setTagsFullHeight(el.scrollHeight)
      setTagsOverflow(el.scrollHeight > threeLines + 4)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [allTags])

  // סינון התוספים
  useEffect(() => {
    let filtered = plugins

    // סינון לפי חיפוש
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(plugin =>
        plugin.name.toLowerCase().includes(query) ||
        plugin.shortDescription.toLowerCase().includes(query) ||
        plugin.description.toLowerCase().includes(query) ||
        plugin.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    // סינון לפי סטטוס
    if (statusFilter !== 'all') {
      filtered = filtered.filter(plugin => plugin.status === statusFilter)
    }

    // סינון לפי תגית
    if (activeTag !== 'all') {
      filtered = filtered.filter(plugin => plugin.tags?.includes(activeTag))
    }

    setFilteredPlugins(filtered)
  }, [searchQuery, statusFilter, activeTag, plugins])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-on-surface/50 font-medium">טוען את כל התוספים...</p>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader />

      <main className="flex-1">
        {/* Page Header + Filters Section */}
        <section className="py-6 px-4 bg-white border-b border-neutral-100">
          <div className="container mx-auto max-w-6xl">
            {/* פירורי לחם */}
            <nav className="flex items-center gap-2 text-sm text-on-surface/60 mb-3" aria-label="פירורי לחם">
              <Link href="/plugins" className="text-primary hover:underline font-medium">
                חנות התוספים
              </Link>
              <span aria-hidden="true">‹</span>
              <span className="font-bold text-on-surface">כל התוספים</span>
            </nav>
            <h1 className="text-3xl font-bold text-on-surface mb-6">כל התוספים</h1>

            <div className="grid md:grid-cols-[1fr_220px_auto] gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-on-surface/60 mb-2">חיפוש</label>
                <PluginSearchBox
                  placeholder="שם, תיאור או תגית..."
                  defaultValue={searchQuery}
                  onSubmit={(q) => setSearchQuery(q)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-on-surface/60 mb-2">סטטוס</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                >
                  <option value="all">הכול</option>
                  <option value="stable">יציב</option>
                  <option value="beta">בטא</option>
                  <option value="experimental">ניסיוני</option>
                </select>
              </div>

              <div className="flex items-end">
                <Link
                  href="/plugins/upload"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-md hover:shadow-lg whitespace-nowrap"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>העלה תוסף חדש</span>
                </Link>
              </div>
            </div>

            {/* Tags Filter */}
            {allTags.length > 0 && (
              <div>
                <div
                  ref={tagsContainerRef}
                  className="flex flex-wrap gap-2 overflow-hidden transition-all duration-300"
                  style={{ maxHeight: !showAllTags ? tagsCollapsedHeight : (tagsFullHeight || undefined) }}
                >
                  <button
                    onClick={() => setActiveTag('all')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      activeTag === 'all'
                        ? 'bg-primary text-white'
                        : 'bg-white border border-neutral-200 text-on-surface/70 hover:border-primary/30 hover:text-primary'
                    }`}
                  >
                    כל התגיות
                  </button>
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setActiveTag(tag)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        activeTag === tag
                          ? 'bg-primary text-white'
                          : 'bg-white border border-neutral-200 text-on-surface/70 hover:border-primary/30 hover:text-primary'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {tagsOverflow && (
                  <button
                    onClick={() => setShowAllTags(v => !v)}
                    className="mt-3 text-sm font-medium text-primary hover:underline"
                  >
                    {showAllTags ? 'הצג פחות' : 'הצג עוד'}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Plugins Grid */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="inline-flex items-center gap-2 text-primary/70 text-sm font-bold mb-2">
                  <div className="w-7 h-px bg-primary/30"></div>
                  <span>רשימת תוספים</span>
                </div>
                <h2 className="text-3xl font-bold text-on-surface">בחרו את התוסף שמתאים לכם</h2>
              </div>
              <p className="text-on-surface/60">
                {filteredPlugins.length === 0
                  ? 'לא נמצאו תוספים לפי הסינון שבחרתם'
                  : filteredPlugins.length === plugins.length
                  ? 'כל התוספים מוצגים'
                  : `מוצגים ${filteredPlugins.length} מתוך ${plugins.length} תוספים`}
              </p>
            </div>

            {filteredPlugins.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-neutral-100">
                <h3 className="text-2xl font-bold text-on-surface mb-3">
                  {plugins.length === 0 ? 'בקרוב יופיעו כאן תוספים נוספים' : 'לא נמצאו תוספים לפי הסינון שבחרתם'}
                </h3>
                <p className="text-on-surface/60 leading-relaxed">
                  {plugins.length === 0
                    ? 'אם יש לכם תוסף מוכן לאוצריא, אפשר לשלוח אותו לחנות ולהציג אותו כאן עם עמוד מסודר, תגיות, הוראות וקישורי התקנה.'
                    : 'נסו לחפש בשם אחר, להסיר תגית, או לבחור סטטוס שונה כדי לראות תוצאות נוספות.'}
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPlugins.map(plugin => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    installState={installState}
                    onInstall={install}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Hero / Info Section */}
        <section className="bg-surface py-16 px-4 border-t border-surface-variant">
          <div className="container mx-auto max-w-6xl">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 text-primary/70 text-sm font-bold mb-4">
                  <div className="w-7 h-px bg-primary/30"></div>
                  <span>תוספים לאוצריא</span>
                </div>
                <h2 className="text-5xl font-bold text-primary font-frank mb-4 leading-tight">
                  להוסיף יכולות חדשות לאוצריא בלחיצה אחת
                </h2>
                <p className="text-on-surface/70 text-lg leading-relaxed">
                  כאן תמצאו תוספים שנבנו במיוחד לחוויית הלימוד באוצריא, עם עמודי הסבר ברורים, קישורי הורדה, ובמקרים מתאימים גם התקנה ישירה מתוך התוכנה.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border border-primary/10">
                  <span className="text-sm text-on-surface/60 block mb-2">זמין עכשיו</span>
                  <div className="text-4xl font-bold text-primary mb-2">{plugins.length} תוספים</div>
                </div>

                <div className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border border-primary/10 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_0_6px_rgba(44,27,2,0.08)]"></div>
                    <span className="text-sm text-on-surface/70">הורדה רגילה לצד התקנה ישירה</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_0_6px_rgba(44,27,2,0.08)]"></div>
                    <span className="text-sm text-on-surface/70">תגיות שעוזרות למצוא את התוסף המתאים</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_0_6px_rgba(44,27,2,0.08)]"></div>
                    <span className="text-sm text-on-surface/70">פרטי גרסה ותאימות במקום אחד</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}

export default function AllPluginsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-on-surface/50 font-medium">טוען את כל התוספים...</p>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    }>
      <AllPluginsPageContent />
    </Suspense>
  )
}

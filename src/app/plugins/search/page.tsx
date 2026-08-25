'use client'

// דף תוצאות החיפוש החכם (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.4):
// נטען עם ?q= מה-URL (שיתופי), עריכה מריצה חיפוש מחדש (debounce 300ms + עדכון URL),
// רשימה אנכית לפי סדר הדירוג עם הדגשת מונחים, צ'יפי קטגוריות מקושרים,
// כפתורי הורדה/התקנה-ישירה ו"טען עוד" לפי offset.

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { useDirectInstall } from '@/components/plugins/useDirectInstall'
import { useDialog } from '@/components/providers/DialogContext'
import { highlightMatches } from '@/components/plugins/PluginSearchBox'
import { formatPluginStatus } from '@/lib/pluginSubmission'
import type { PluginSearchResult, PluginCategorySummary } from '@/components/plugins/types'

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 20

function PluginSearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQuery = searchParams.get('q') || ''
  const [inputValue, setInputValue] = useState(initialQuery)
  const [executedQuery, setExecutedQuery] = useState('')
  const [results, setResults] = useState<PluginSearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [relaxed, setRelaxed] = useState(false)
  const [searching, setSearching] = useState(Boolean(initialQuery.trim()))
  const [loadingMore, setLoadingMore] = useState(false)
  const [categories, setCategories] = useState<PluginCategorySummary[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const firstRunRef = useRef(true)
  // השאילתה העדכנית — תשובה של בקשה ישנה שאינה תואמת אותה נזרקת (מניעת race)
  const currentQueryRef = useRef(initialQuery.trim())
  const { installState, install } = useDirectInstall()
  const { showAlert } = useDialog() as { showAlert: (title: string, message: string) => void }

  const trimmedInput = inputValue.trim()

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

  // קטגוריות להצעה במצב אפס-תוצאות (עד 3)
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetch('/api/plugins/categories')
        if (!response.ok) return
        const data = await response.json()
        if (Array.isArray(data)) setCategories(data)
      } catch {
        // לא קריטי — פשוט לא יוצגו הצעות קטגוריה
      }
    }
    loadCategories()
  }, [])

  // שינוי בתיבה: ביטול מיידי של בקשה באוויר (שתשובתה כבר לא רלוונטית);
  // ריקון מנקה את התוצאות מיד, שינוי אמיתי מדליק מצב "מחפש"
  const handleInputChange = (next: string) => {
    setInputValue(next)
    const nextTrimmed = next.trim()
    currentQueryRef.current = nextTrimmed
    if (nextTrimmed !== trimmedInput) {
      abortRef.current?.abort()
    }
    if (!nextTrimmed) {
      setResults([])
      setTotal(0)
      setRelaxed(false)
      setExecutedQuery('')
      setSearching(false)
      router.replace('/plugins/search', { scroll: false })
    } else if (nextTrimmed !== trimmedInput) {
      setSearching(true)
    }
  }

  // חיפוש עם debounce + עדכון ה-URL (replace) כדי שהקישור יישאר שיתופי.
  // בטעינה ראשונה עם ?q= — חיפוש מיידי בלי debounce ובלי עדכון URL.
  useEffect(() => {
    const isFirstRun = firstRunRef.current
    firstRunRef.current = false
    if (!trimmedInput) return

    const timer = setTimeout(async () => {
      if (!isFirstRun) {
        router.replace(`/plugins/search?q=${encodeURIComponent(trimmedInput)}`, { scroll: false })
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const requestQuery = trimmedInput
      try {
        const response = await fetch(
          `/api/plugins/search?q=${encodeURIComponent(requestQuery)}&limit=${PAGE_SIZE}&offset=0`,
          { signal: controller.signal }
        )
        // תשובה שהגיעה אחרי שהקלט השתנה — נזרקת (הבקשה העדכנית כבר בדרך)
        if (controller.signal.aborted || requestQuery !== currentQueryRef.current) return
        if (!response.ok) {
          setSearching(false)
          return
        }
        const data = await response.json()
        if (requestQuery !== currentQueryRef.current) return
        setResults(Array.isArray(data.results) ? data.results : [])
        setTotal(data.total || 0)
        setRelaxed(data.relaxed === true)
        setExecutedQuery(data.query || trimmedInput)
        setSearching(false)
      } catch (error) {
        // בקשה שבוטלה — החיפוש הבא כבר בדרך; שגיאת רשת — מפסיקים את מצב הטעינה
        if ((error as Error)?.name !== 'AbortError') setSearching(false)
      }
    }, isFirstRun ? 0 : SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedInput])

  // "טען עוד" — המשך התוצאות לפי offset
  const loadMore = async () => {
    if (loadingMore || !executedQuery) return
    setLoadingMore(true)
    const requestQuery = executedQuery
    try {
      const response = await fetch(
        `/api/plugins/search?q=${encodeURIComponent(requestQuery)}&limit=${PAGE_SIZE}&offset=${results.length}`
      )
      if (!response.ok) return
      const data = await response.json()
      // הקלט השתנה בזמן הטעינה — לא מצרפים תוצאות של השאילתה הישנה
      if (requestQuery !== currentQueryRef.current) return
      if (Array.isArray(data.results)) {
        setResults(prev => [...prev, ...data.results])
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Error loading more results:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const canDirectInstall = (plugin: PluginSearchResult) =>
    Boolean(plugin.supportsDirectInstall && plugin.downloadUrl)

  const hasQuery = Boolean(trimmedInput)
  const showZeroResults = hasQuery && !searching && executedQuery && results.length === 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader showAuth />

      <main className="flex-1">
        {/* Search Header */}
        <section className="py-8 px-4 bg-white border-b border-neutral-100">
          <div className="container mx-auto max-w-4xl">
            {/* פירורי לחם */}
            <nav className="flex items-center gap-2 text-sm text-on-surface/60 mb-4" aria-label="פירורי לחם">
              <Link href="/plugins" className="text-primary hover:underline font-medium">
                חנות התוספים
              </Link>
              <span aria-hidden="true">‹</span>
              <span className="font-bold text-on-surface">חיפוש</span>
            </nav>
            <h1 className="text-3xl font-bold text-on-surface mb-5">חיפוש תוספים</h1>
            <input
              type="search"
              placeholder="חפשו תוסף לפי שם, תיאור או נושא..."
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              autoFocus={!initialQuery}
              className="w-full px-6 py-4 text-lg border border-neutral-200 rounded-2xl shadow-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
            />
          </div>
        </section>

        {/* Results */}
        <section className="py-10 px-4">
          <div className="container mx-auto max-w-4xl">
            {!hasQuery ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-neutral-100">
                <span className="material-symbols-outlined text-5xl text-primary/40 mb-4 inline-block">search</span>
                <h2 className="text-2xl font-bold text-on-surface mb-3">מה מחפשים?</h2>
                <p className="text-on-surface/60 leading-relaxed">
                  הקלידו למעלה שם תוסף, תיאור או נושא — התוצאות יופיעו כאן מיד.
                </p>
              </div>
            ) : searching && results.length === 0 ? (
              // שלד טעינה — שורות תוצאה מהבהבות
              <div className="space-y-4 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 bg-neutral-200 rounded-2xl"></div>
                ))}
              </div>
            ) : showZeroResults ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-neutral-100">
                <h2 className="text-2xl font-bold text-on-surface mb-3">
                  לא נמצאו תוספים עבור &apos;{executedQuery}&apos;
                </h2>
                <p className="text-on-surface/60 leading-relaxed mb-6">
                  נסו ניסוח אחר, או עיינו ברשימה המלאה של כל התוספים.
                </p>
                <Link
                  href="/plugins/all"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors mb-6"
                >
                  <span>לכל התוספים</span>
                  <span aria-hidden="true">←</span>
                </Link>
                {categories.length > 0 && (
                  <div>
                    <p className="text-sm font-bold text-on-surface/50 mb-3">או עיינו לפי קטגוריה:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {categories.slice(0, 3).map(category => (
                        <Link
                          key={category.id}
                          href={`/plugins/category/${category.slug}`}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-surface hover:bg-primary/10 rounded-full text-sm font-medium text-on-surface/70 hover:text-primary transition-colors"
                        >
                          {category.icon && (
                            <span className="material-symbols-outlined text-base">{category.icon}</span>
                          )}
                          <span>{category.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* מונה תוצאות */}
                {executedQuery && (
                  <div className="mb-6">
                    <p className="text-on-surface/70 text-lg">
                      נמצאו <span className="font-bold text-on-surface">{total}</span> תוספים עבור &apos;{executedQuery}&apos;
                    </p>
                    {relaxed && (
                      <p className="text-sm text-on-surface/50 mt-1">
                        לא נמצאו התאמות מדויקות לכל המילים — תוצאות קרובות:
                      </p>
                    )}
                  </div>
                )}

                {/* רשימה אנכית — סדר הדירוג חשוב */}
                <div className="space-y-4">
                  {results.map(plugin => (
                    <article
                      key={plugin.id}
                      className="flex flex-col sm:flex-row gap-5 bg-white rounded-2xl border border-neutral-100 p-5 hover:shadow-lg transition-shadow"
                    >
                      {/* תמונת מיני */}
                      <Link href={`/plugins/${plugin.id}`} className="shrink-0">
                        <img
                          src={plugin.image || '/logo.webp'}
                          alt={plugin.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full sm:w-28 h-36 sm:h-28 rounded-xl object-cover bg-gradient-to-br from-primary/5 to-secondary/5"
                        />
                      </Link>

                      {/* פרטים */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Link href={`/plugins/${plugin.id}`}>
                            <h2 className="text-xl font-bold text-on-surface hover:text-primary transition-colors">
                              {highlightMatches(plugin.name, executedQuery)}
                            </h2>
                          </Link>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">
                            {formatPluginStatus(plugin.status)}
                          </span>
                        </div>
                        <p className="text-on-surface/70 text-sm leading-relaxed line-clamp-2 mb-3">
                          {plugin.shortDescription}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {plugin.tags?.slice(0, 4).map(tag => (
                            <span
                              key={tag}
                              className="px-2 py-1 bg-surface rounded-full text-xs text-on-surface/60"
                            >
                              {tag}
                            </span>
                          ))}
                          {plugin.categories?.map(category => (
                            <Link
                              key={category.slug}
                              href={`/plugins/category/${category.slug}`}
                              className="px-2 py-1 bg-primary/5 border border-primary/15 rounded-full text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                            >
                              {category.name}
                            </Link>
                          ))}
                        </div>
                      </div>

                      {/* פעולות */}
                      <div className="flex sm:flex-col gap-2 sm:w-44 shrink-0 sm:justify-center">
                        <a
                          href={plugin.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-primary/90 text-white rounded-full text-sm font-bold text-center hover:bg-primary transition-colors"
                        >
                          הורדה
                        </a>
                        {canDirectInstall(plugin) && (
                          <button
                            onClick={() => install(plugin)}
                            disabled={installState.pluginId === plugin.id && installState.phase === 'waiting'}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-primary/20 text-primary rounded-full text-sm font-bold hover:bg-primary/5 transition-colors text-center disabled:cursor-default disabled:opacity-80"
                          >
                            {installState.pluginId === plugin.id && installState.phase === 'waiting' ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                                <span>מתקין...</span>
                              </>
                            ) : installState.pluginId === plugin.id && installState.phase === 'success' ? (
                              <span>{installState.updated ? 'עודכן בהצלחה!' : 'הותקן בהצלחה!'}</span>
                            ) : installState.pluginId === plugin.id && installState.phase === 'failure' ? (
                              <span>ההתקנה נכשלה - לחץ שוב לנסיון נוסף</span>
                            ) : (
                              <span>התקנה ישירה</span>
                            )}
                          </button>
                        )}
                        <Link
                          href={`/plugins/${plugin.id}`}
                          className="hidden sm:block text-center text-sm font-bold text-primary hover:underline"
                        >
                          לפרטים מלאים
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>

                {/* טען עוד */}
                {results.length < total && (
                  <div className="mt-8 text-center">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-primary/20 text-primary rounded-xl font-bold hover:bg-primary/5 transition-colors disabled:opacity-60"
                    >
                      {loadingMore ? (
                        <>
                          <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                          <span>טוען...</span>
                        </>
                      ) : (
                        <span>טען עוד ({total - results.length} נוספים)</span>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}

export default function PluginSearchPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader showAuth />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-on-surface/50 font-medium">טוען את החיפוש...</p>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    }>
      <PluginSearchPageContent />
    </Suspense>
  )
}

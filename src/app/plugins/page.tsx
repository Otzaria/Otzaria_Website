'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { buildDirectPluginInstallUrl } from '@/lib/pluginInstall'
import { formatPluginStatus } from '@/lib/pluginSubmission'

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
  tags: string[]
  image: string
  screenshots: string[]
  downloadUrl: string
  supportsDirectInstall: boolean
  homepage: string
}

function PluginsPageContent() {
  const searchParams = useSearchParams()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [filteredPlugins, setFilteredPlugins] = useState<Plugin[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeTag, setActiveTag] = useState('all')
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

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
        
        // בדיקה אם יש תגית ב-URL
        const tagFromUrl = searchParams.get('tag')
        if (tagFromUrl) {
          setActiveTag(tagFromUrl)
        }
      } catch (error) {
        console.error('Error loading plugins:', error)
      } finally {
        setLoading(false)
      }
    }
    loadPlugins()
  }, [searchParams])

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

  // המרת מספר לגימטריה עברית
  const toHebrewNumeral = (num: number): string => {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
    const hundreds = ['', 'ק', 'ר', 'ש', 'ת']
    const thousands = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
    
    if (num === 0) return ''
    if (num > 9999) return num.toString()
    
    let result = ''
    
    // אלפים
    const thousandsDigit = Math.floor(num / 1000)
    if (thousandsDigit > 0) {
      result += thousands[thousandsDigit] + "'"
      num %= 1000
    }
    
    // מאות - טיפול במאות מעל 400
    const hundredsDigit = Math.floor(num / 100)
    if (hundredsDigit > 0) {
      if (hundredsDigit <= 4) {
        result += hundreds[hundredsDigit]
      } else if (hundredsDigit === 5) {
        result += 'תק' // 500
      } else if (hundredsDigit === 6) {
        result += 'תר' // 600
      } else if (hundredsDigit === 7) {
        result += 'תש' // 700
      } else if (hundredsDigit === 8) {
        result += 'תת' // 800
      } else if (hundredsDigit === 9) {
        result += 'תתק' // 900
      }
      num %= 100
    }
    
    // טיפול מיוחד ב-15 ו-16 (ט"ו, ט"ז במקום י"ה, י"ו)
    if (num === 15) {
      result += 'טו'
    } else if (num === 16) {
      result += 'טז'
    } else {
      // עשרות
      const tensDigit = Math.floor(num / 10)
      if (tensDigit > 0) {
        result += tens[tensDigit]
        num %= 10
      }
      
      // יחידות
      if (num > 0) {
        result += ones[num]
      }
    }
    
    // הוספת גרש או גרשיים
    if (result.length === 1) {
      result += "'"
    } else if (result.length > 1) {
      result = result.slice(0, -1) + '"' + result.slice(-1)
    }
    
    return result
  }

  const formatHebrewDate = (dateStr: string) => {
    try {
      let date: Date
      
      // אם זה ISO timestamp (כולל שעה)
      if (dateStr.includes('T')) {
        date = new Date(dateStr)
      } else {
        // אם זה תאריך פשוט (YYYY-MM-DD)
        const [year, month, dayNum] = dateStr.split('-').map(Number)
        date = new Date(Date.UTC(year, month - 1, dayNum, 12))
      }
      
      const formatter = new Intl.DateTimeFormat('he-u-ca-hebrew', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      })
      
      const formatted = formatter.format(date)
      
      // פירוק התאריך לחלקים
      const parts = formatter.formatToParts(date)
      const dayPart = parts.find(p => p.type === 'day')
      const monthPart = parts.find(p => p.type === 'month')
      const yearPart = parts.find(p => p.type === 'year')
      
      if (!dayPart || !monthPart || !yearPart) {
        return formatted // fallback למקרה של בעיה
      }
      
      const day = parseInt(dayPart.value)
      const monthName = monthPart.value
      const year = parseInt(yearPart.value)
      
      return `${toHebrewNumeral(day)} ${monthName} ${toHebrewNumeral(year)}`
    } catch (error) {
      console.error('Error formatting date:', error, dateStr)
      return dateStr
    }
  }

  const canDirectInstall = (plugin: Plugin) => {
    return Boolean(plugin.supportsDirectInstall && plugin.downloadUrl)
  }

  const handleDirectInstall = (plugin: Plugin) => {
    if (canDirectInstall(plugin)) {
      window.location.href = buildDirectPluginInstallUrl(plugin.downloadUrl, window.location.origin)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-on-surface/50 font-medium">טוען את חנות התוספים...</p>
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
        {/* Hero Section */}
        <section className="bg-surface py-16 px-4 border-b border-surface-variant">
          <div className="container mx-auto max-w-6xl">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 text-primary/70 text-sm font-bold mb-4">
                  <div className="w-7 h-px bg-primary/30"></div>
                  <span>תוספים לאוצריא</span>
                </div>
                <h1 className="text-5xl font-bold text-primary font-frank mb-4 leading-tight">
                  להוסיף יכולות חדשות לאוצריא בלחיצה אחת
                </h1>
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

        {/* Filters Section */}
        <section className="py-6 px-4 bg-white border-b border-gray-100">
          <div className="container mx-auto max-w-6xl">
            <div className="grid md:grid-cols-[1fr_220px_auto] gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-on-surface/60 mb-2">חיפוש</label>
                <input
                  type="search"
                  placeholder="שם, תיאור או תגית..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-on-surface/60 mb-2">סטטוס</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
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
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTag('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    activeTag === 'all'
                      ? 'bg-primary text-white'
                      : 'bg-white border border-gray-200 text-on-surface/70 hover:border-primary/30 hover:text-primary'
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
                        : 'bg-white border border-gray-200 text-on-surface/70 hover:border-primary/30 hover:text-primary'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
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
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-100">
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
                  <article
                    key={plugin.id}
                    className="flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
                  >
                    {/* Plugin Image */}
                    <Link
                      href={`/plugins/${plugin.id}`}
                      className="relative aspect-[16/11] bg-gradient-to-br from-primary/5 to-secondary/5 overflow-hidden"
                    >
                      <img
                        src={plugin.image || '/logo.svg'}
                        alt={plugin.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </Link>

                    {/* Plugin Body */}
                    <div className="flex-1 p-5 flex flex-col gap-4">
                      {/* Status & Version */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          plugin.status === 'stable' ? 'bg-primary/10 text-primary' :
                          plugin.status === 'beta' ? 'bg-primary/15 text-primary' :
                          'bg-primary/20 text-primary'
                        }`}>
                          {formatPluginStatus(plugin.status)}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface text-on-surface/60">
                          גרסה {plugin.version}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <Link
                        href={`/plugins/${plugin.id}`}
                        className="block"
                      >
                        <h3 className="text-xl font-bold text-on-surface mb-2 group-hover:text-primary transition-colors">
                          {plugin.name}
                        </h3>
                        <p className="text-on-surface/70 text-sm leading-relaxed line-clamp-3">
                          {plugin.shortDescription}
                        </p>
                      </Link>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2">
                        {plugin.tags?.slice(0, 4).map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-surface rounded-full text-xs text-on-surface/60"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={plugin.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 px-4 py-2.5 bg-primary/90 text-white rounded-full text-sm font-bold text-center hover:bg-primary transition-colors"
                        >
                          הורדה
                        </a>
                        {canDirectInstall(plugin) && (
                          <button
                            onClick={() => handleDirectInstall(plugin)}
                            className="flex-1 px-4 py-2.5 bg-white border border-primary/20 text-primary rounded-full text-sm font-bold hover:bg-primary/5 transition-colors text-center"
                          >
                            התקנה ישירה
                          </button>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <Link
                          href={`/plugins/${plugin.id}`}
                          className="text-sm font-bold text-primary hover:underline"
                        >
                          לפרטים מלאים
                        </Link>
                        <span className="text-xs text-on-surface/50">
                          עודכן ב־{formatHebrewDate(plugin.originalDate || plugin.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}

export default function PluginsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-on-surface/50 font-medium">טוען את חנות התוספים...</p>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    }>
      <PluginsPageContent />
    </Suspense>
  )
}

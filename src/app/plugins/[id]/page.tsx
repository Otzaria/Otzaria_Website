'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import PluginEditModal from '@/components/plugins/PluginEditModal'
import { useDialog } from '@/components/providers/DialogContext'

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
  installInstructions: string[]
  authorId?: string | null
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

  const formatStatus = (status: string) => {
    const labels: Record<string, string> = {
      stable: 'יציב',
      beta: 'בטא',
      experimental: 'ניסיוני'
    }
    return labels[status] || 'לא ידוע'
  }

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

  const handleDirectInstall = () => {
    if (plugin && canDirectInstall(plugin)) {
      window.location.href = `otzaria://plugin/install?url=${encodeURIComponent(plugin.downloadUrl)}`
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

  const canEdit = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.id === plugin.authorId))

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
          {/* Back Button */}
          <Link
            href="/plugins"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-6 font-medium"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
            <span>חזרה לחנות</span>
          </Link>

          {/* Plugin Header */}
          <div className="bg-white rounded-2xl border border-gray-100 p-8 mb-6">
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
                    {formatStatus(plugin.status)}
                  </span>
                  <span className="px-4 py-2 rounded-full text-sm font-bold bg-surface text-on-surface/60">
                    גרסה {plugin.version}
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
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-primary text-primary rounded-xl font-bold hover:bg-primary/5 transition-colors"
                    >
                      <span className="material-symbols-outlined">install_desktop</span>
                      <span>התקנה ישירה לאוצריא</span>
                    </button>
                  )}
                  {plugin.homepage && (
                    <a
                      href={plugin.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-on-surface rounded-xl font-medium hover:border-primary/30 transition-colors"
                    >
                      <span className="material-symbols-outlined">open_in_new</span>
                      <span>דיון בפורום</span>
                    </a>
                  )}
                  {canEdit && (
                    <button
                      onClick={handleEdit}
                      disabled={loadingEdit}
                      className="inline-flex items-center gap-2 rounded-xl bg-stone-700 px-6 py-3 font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined">edit</span>
                      <span>{loadingEdit ? 'טוען...' : 'ערוך'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Plugin Details Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Info Section */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
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
                  <div className="font-bold text-on-surface">{formatStatus(plugin.status)}</div>
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
                  <div className="text-sm text-on-surface/60 mb-1">תאימות</div>
                  <div className="font-bold text-on-surface">{plugin.compatibleWith}</div>
                </div>
              </div>
            </div>

            {/* Tags Section */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
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

          {/* Installation Instructions */}
          {plugin.installInstructions && plugin.installInstructions.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">checklist</span>
                <span>הוראות התקנה</span>
              </h2>
              <ol className="space-y-3 pr-6">
                {plugin.installInstructions.map((instruction, index) => (
                  <li key={index} className="text-on-surface/80 leading-relaxed list-decimal">
                    {instruction}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </main>

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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { useDialog } from '@/components/providers/DialogContext'
import { MIN_SUPPORTED_APP_VERSION } from '@/lib/pluginSubmission'

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export default function UploadPluginPage() {
  const router = useRouter()
  const { showAlert, showMessage } = useDialog() as {
    showAlert: (title: string, message: string) => void
    showMessage: (title: string, message: string) => Promise<void>
  }
  const [loading, setLoading] = useState(false)

  // שדות הטופס
  const [formData, setFormData] = useState({
    name: '',
    shortDescription: '',
    description: '',
    version: '',
    status: 'stable' as 'stable' | 'beta' | 'experimental',
    author: '',
    compatibleWith: '',
    tags: [] as string[],
    homepage: ''
  })

  // תוכנה נלווית — תוסף שאינו עובד לבדו ומדבר עם תוכנה שרצה מחוץ לאוצריא.
  // המתקין מועלה כקובץ נפרד: קובץ הרצה בתוך ה-.otzplugin נדחה בשרת, כי אוצריא
  // מחלצת אותו לתיקיית התוסף ואיש אינו יכול להריץ אותו משם.
  const [companionFile, setCompanionFile] = useState<File | null>(null)
  const [companion, setCompanion] = useState({
    name: '',
    version: '',
    platform: 'windows' as 'windows' | 'linux' | 'macos',
    installsPlugin: false
  })

  // קבצים
  const [pluginFile, setPluginFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([])

  // תגית חדשה
  const [newTag, setNewTag] = useState('')

  // מצב גרירה לכל אזור העלאה בנפרד
  const [isDraggingPlugin, setIsDraggingPlugin] = useState(false)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [isDraggingScreenshots, setIsDraggingScreenshots] = useState(false)

  const makeDropHandlers = (
    setIsDragging: (v: boolean) => void,
    onFiles: (files: FileList) => void
  ) => ({
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      const related = e.relatedTarget as Node | null
      if (related && e.currentTarget.contains(related)) return
      setIsDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      setIsDragging(false)
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files)
    },
  })

  // טיפול בשינוי שדות
  const handleChange = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // הוספת תגית
  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      handleChange('tags', [...formData.tags, newTag.trim()])
      setNewTag('')
    }
  }

  // הסרת תגית
  const removeTag = (tag: string) => {
    handleChange('tags', formData.tags.filter(t => t !== tag))
  }

  // מגבלות חייבות להיות עקביות עם השרת ([src/app/api/plugins/upload/route.js]).
  const MAX_PLUGIN_BYTES = 50 * 1024 * 1024
  const MAX_COMPANION_BYTES = 150 * 1024 * 1024
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024
  const MAX_SCREENSHOTS = 10
  const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  // שיקוף של COMPANION_PLATFORMS ב-src/lib/pluginCompanion.js. משוכפל ולא מיובא
  // כי הלוגיקה בשרת נשענת על path ועל גיבוב, ואין טעם לגרור אותם לדפדפן.
  const COMPANION_EXTENSIONS: Record<string, string[]> = {
    windows: ['.exe', '.msi'],
    linux: ['.appimage', '.deb', '.rpm', '.sh'],
    macos: ['.dmg', '.pkg']
  }

  // Reads manifest.json from an .otzplugin (ZIP) file using fflate
  async function readPluginManifest(file: File): Promise<Record<string, unknown>> {
    const { unzipSync } = await import('fflate')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const unzipped = unzipSync(bytes, { filter: (info) => info.name === 'manifest.json' })
    const manifestBytes = unzipped['manifest.json']
    if (!manifestBytes) throw new Error('manifest.json not found in plugin file')
    return JSON.parse(new TextDecoder().decode(manifestBytes))
  }

  function versionAtLeast(v: string, min: string): boolean {
    const parse = (s: string) => s.split('.').map(Number)
    const va = parse(v), vm = parse(min)
    for (let i = 0; i < Math.max(va.length, vm.length); i++) {
      const a = va[i] ?? 0, b = vm[i] ?? 0
      if (a !== b) return a > b
    }
    return true
  }

  // עיבוד קובץ תוסף (משותף ל-input ול-drop)
  const processPluginFile = async (file: File, resetInput: () => void) => {
    if (!file.name.toLowerCase().endsWith('.otzplugin')) {
      showAlert('שגיאה', 'קובץ התוסף חייב להיות בפורמט .otzplugin')
      resetInput()
      return
    }
    if (file.size > MAX_PLUGIN_BYTES) {
      showAlert('שגיאה', `קובץ התוסף חורג מהמגבלה של ${MAX_PLUGIN_BYTES / 1024 / 1024}MB`)
      resetInput()
      return
    }

    let manifest: Record<string, unknown>
    try {
      manifest = await readPluginManifest(file)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showAlert('שגיאה', `לא ניתן לקרוא את manifest.json מקובץ התוסף: ${msg}`)
      resetInput()
      return
    }

    const manifestId = (typeof manifest.id === 'string' ? manifest.id : '').trim()
    const version = (typeof manifest.version === 'string' ? manifest.version : '').trim()
    const name = (typeof manifest.name === 'string' ? manifest.name : '').trim()
    const author = (typeof manifest.author === 'string' ? manifest.author : '').trim()
    const shortDescription = (typeof manifest.description === 'string' ? manifest.description : '').trim()
    const stability = (typeof manifest.stability === 'string' ? manifest.stability : '').trim()
    const minAppVersion = (typeof manifest.minAppVersion === 'string' ? manifest.minAppVersion : '').trim()
    const homepage = (typeof manifest.homepage === 'string' ? manifest.homepage : '').trim()

    if (!manifestId) { showAlert('שגיאה', 'חסר שדה id ב-manifest.json (מזהה ייחודי בסגנון com.company.plugin-name)'); resetInput(); return }
    if (!version) { showAlert('שגיאה', 'חסר שדה גרסה ב-manifest.json'); resetInput(); return }
    if (!name) { showAlert('שגיאה', 'חסר שדה name ב-manifest.json'); resetInput(); return }
    if (!author) { showAlert('שגיאה', 'חסר שדה author ב-manifest.json'); resetInput(); return }
    if (!shortDescription) { showAlert('שגיאה', 'חסר שדה description ב-manifest.json'); resetInput(); return }
    if (!stability || !['stable', 'beta', 'experimental'].includes(stability)) {
      showAlert('שגיאה', 'חסר שדה stability תקין ב-manifest.json (ערכים מותרים: stable, beta, experimental)')
      resetInput(); return
    }
    if (!minAppVersion) { showAlert('שגיאה', 'חסר שדה minAppVersion ב-manifest.json'); resetInput(); return }
    if (!versionAtLeast(minAppVersion, MIN_SUPPORTED_APP_VERSION)) {
      showAlert('שגיאה', `גרסת המינימום (${minAppVersion}) לא יכולה להיות פחות מ-${MIN_SUPPORTED_APP_VERSION}`)
      resetInput(); return
    }

    handleChange('version', version)
    handleChange('name', name)
    handleChange('author', author)
    handleChange('shortDescription', shortDescription)
    handleChange('status', stability as 'stable' | 'beta' | 'experimental')
    handleChange('compatibleWith', minAppVersion)
    handleChange('homepage', homepage)
    setPluginFile(file)
  }

  const handlePluginFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    await processPluginFile(file, () => { input.value = '' })
  }

  const dropPluginFile = (files: FileList) => {
    if (files.length > 1) {
      showAlert('שגיאה', 'ניתן לגרור רק קובץ תוסף אחד')
      return
    }
    const file = files[0]
    if (file) void processPluginFile(file, () => {})
  }

  // ===== תוכנה נלווית =====
  const COMPANION_LABELS: Record<string, string> = { windows: 'Windows', linux: 'Linux', macos: 'macOS' }

  const companionExtOf = (fileName: string) => (fileName.match(/\.[^.]+$/)?.[0] || '').toLowerCase()

  const handleCompanionFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    const allowed = COMPANION_EXTENSIONS[companion.platform]
    const ext = companionExtOf(file.name)
    if (!allowed.includes(ext)) {
      showAlert(
        'שגיאה',
        `סיומת המתקין (${ext || 'ללא סיומת'}) אינה מתאימה ל-${COMPANION_LABELS[companion.platform]}. מותר: ${allowed.join(', ')}`
      )
      input.value = ''
      return
    }
    if (file.size > MAX_COMPANION_BYTES) {
      showAlert('שגיאה', `קובץ המתקין חורג מהמגבלה של ${MAX_COMPANION_BYTES / 1024 / 1024}MB`)
      input.value = ''
      return
    }
    setCompanionFile(file)
  }

  // החלפת מערכת ההפעלה אחרי בחירת הקובץ: מתקין ל-Windows אינו מתקין ל-macOS,
  // ולכן קובץ שסיומתו אינה מתאימה עוד מוסר במקום להישלח ולהיפסל בשרת.
  const handleCompanionPlatform = (platform: 'windows' | 'linux' | 'macos') => {
    setCompanion(prev => ({ ...prev, platform }))
    if (companionFile && !COMPANION_EXTENSIONS[platform].includes(companionExtOf(companionFile.name))) {
      setCompanionFile(null)
      showAlert(
        'הקובץ הוסר',
        `${companionFile.name} אינו מתקין של ${COMPANION_LABELS[platform]}. יש לבחור קובץ מתאים (${COMPANION_EXTENSIONS[platform].join(', ')}).`
      )
    }
  }

  // עיבוד תמונה (משותף ל-input ול-drop)
  const processImageFile = (file: File) => {
    if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
      showAlert('שגיאה', 'תמונה חייבת להיות בפורמט PNG, JPEG, WEBP או GIF')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showAlert('שגיאה', `התמונה חורגת מהמגבלה של ${MAX_IMAGE_BYTES / 1024 / 1024}MB`)
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processImageFile(file)
  }

  const dropImageFile = (files: FileList) => {
    if (files.length > 1) {
      showAlert('שגיאה', 'ניתן לגרור תמונה אחת בלבד')
      return
    }
    const file = files[0]
    if (file) processImageFile(file)
  }

  // עיבוד צילומי מסך (משותף ל-input ול-drop)
  const processScreenshotFiles = (files: File[]) => {
    if (files.length > MAX_SCREENSHOTS) {
      showAlert('שגיאה', `מותר עד ${MAX_SCREENSHOTS} צילומי מסך`)
      return
    }
    for (const f of files) {
      if (!ALLOWED_IMAGE_MIMES.includes(f.type)) {
        showAlert('שגיאה', 'צילומי מסך חייבים להיות בפורמט PNG, JPEG, WEBP או GIF')
        return
      }
      if (f.size > MAX_IMAGE_BYTES) {
        showAlert('שגיאה', `כל צילום מסך מוגבל ל-${MAX_IMAGE_BYTES / 1024 / 1024}MB`)
        return
      }
    }
    setScreenshotFiles(files)

    const previews: string[] = []
    files.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        previews.push(reader.result as string)
        if (previews.length === files.length) {
          setScreenshotPreviews(previews)
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleScreenshotFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    processScreenshotFiles(Array.from(e.target.files || []))
  }

  const dropScreenshotFiles = (files: FileList) => {
    processScreenshotFiles(Array.from(files))
  }

  // שליחת הטופס
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // בדיקות
      if (!pluginFile) {
        throw new Error('חובה לצרף קובץ תוסף')
      }

      if (!formData.description || !formData.compatibleWith) {
        throw new Error('נא למלא את כל השדות החובה')
      }

      if (!formData.version || !formData.name || !formData.author || !formData.shortDescription) {
        throw new Error('נא לבחור קובץ תוסף תחילה - שם, מפתח, תיאור קצר וגרסה יזוהו אוטומטית')
      }

      if (screenshotFiles.length < 1) {
        throw new Error('חובה לצרף לפחות צילום מסך אחד. ללא צילום מסך התוסף יידחה')
      }

      if (!['stable', 'beta', 'experimental'].includes(formData.status)) {
        throw new Error('סטטוס לא תקין')
      }

      if (companionFile && !companion.name.trim()) {
        throw new Error('יש למלא את שם התוכנה הנלווית — הוא מוצג למשתמש בדף התוסף')
      }
      if (!companionFile && companion.name.trim()) {
        throw new Error('צורף שם תוכנה נלווית בלי קובץ מתקין. יש לצרף את המתקין או לרוקן את השם')
      }

      // יצירת FormData
      const data = new FormData()
      data.append('name', formData.name)
      data.append('shortDescription', formData.shortDescription)
      data.append('description', formData.description)
      data.append('version', formData.version)
      data.append('status', formData.status)
      data.append('author', formData.author)
      data.append('compatibleWith', formData.compatibleWith)
      data.append('tags', JSON.stringify(formData.tags))
      data.append('homepage', formData.homepage)
      
      data.append('pluginFile', pluginFile)
      if (companionFile) {
        data.append('companionFile', companionFile)
        data.append('companionName', companion.name.trim())
        data.append('companionVersion', companion.version.trim())
        data.append('companionPlatform', companion.platform)
        data.append('companionInstallsPlugin', companion.installsPlugin ? 'true' : 'false')
      }
      if (imageFile) {
        data.append('imageFile', imageFile)
      }
      screenshotFiles.forEach(file => {
        data.append('screenshots', file)
      })

      // שליחה לשרת
      const response = await fetch('/api/plugins/upload', {
        method: 'POST',
        body: data
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בהעלאת התוסף')
      }

      const designNote = result?.designCompliant === false
        ? '\n(התגית "מראה תואם לאוצריא" לא נוספה — העיצוב אינו תואם להנחיות.)'
        : ''
      await showAlert(
        'הצלחה',
        `התוסף הועלה בהצלחה ונשלח לאישור מנהל. לאחר האישור הוא יופיע בחנות התוספים.${designNote}`
      )
      router.push('/plugins')
    } catch (error: unknown) {
      // showMessage: דיאלוג מודאלי חוסם, נשאר על המסך עד שהמשתמש לוחץ אישור,
      // כך שהודעות שגיאה רב-שורתיות (למשל פירוט ולידציה מול ה-SDK) ייקראו במלואן.
      await showMessage('שגיאה בהעלאת התוסף', getErrorMessage(error, 'שגיאה בהעלאת התוסף'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader showAuth />
      
      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/plugins"
              className="inline-flex items-center gap-2 text-primary hover:underline mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              חזרה לחנות התוספים
            </Link>
            <h1 className="text-4xl font-bold text-primary font-frank mb-4">
              העלאת תוסף חדש
            </h1>
            <p className="text-on-surface/70 text-lg">
              מלאו את הפרטים הבאים כדי להעלות תוסף לחנות. התוסף יעבור אישור מנהל לפני שיופיע בחנות.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* מידע בסיסי */}
            <section className="bg-white rounded-2xl border border-neutral-100 p-6">
              <h2 className="text-2xl font-bold text-on-surface mb-6">מידע בסיסי</h2>
              
              <div className="space-y-4">
                <div className="rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-on-surface/70">
                  שאר המידע יילקח אוטומטית מקובץ התוסף, מתוך <code>manifest.json</code>. יש לוודא שהשדות הבאים מוגדרים בקובץ:
                  <br />
                  <strong>name</strong>, <strong>author</strong>, <strong>description</strong>, <strong>version</strong>, <strong>stability</strong>, <strong>minAppVersion</strong>
                  <span> (ואם יש, גם </span>
                  <strong>homepage</strong>
                  <span>).</span>
                </div>

                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    תיאור מלא <span className="text-danger-500">*</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 min-h-[150px]"
                    placeholder="תיאור מפורט של התוסף, מה הוא עושה ואיך להשתמש בו"
                    maxLength={10000}
                    required
                  />
                </div>

              </div>
            </section>

            {/* תגיות */}
            <section className="bg-white rounded-2xl border border-neutral-100 p-6">
              <h2 className="text-2xl font-bold text-on-surface mb-6">תגיות</h2>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="flex-1 px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    placeholder="הוסף תגית (לדוגמה: מילון, חיפוש, כלי עזר)"
                    maxLength={40}
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  >
                    הוסף
                  </button>
                </div>

                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-primary/70"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* קבצים */}
            <section className="bg-white rounded-2xl border border-neutral-100 p-6">
              <h2 className="text-2xl font-bold text-on-surface mb-6">קבצים</h2>
              
              <div className="space-y-6">
                {/* קובץ תוסף */}
                <div
                  {...makeDropHandlers(setIsDraggingPlugin, dropPluginFile)}
                  className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                    isDraggingPlugin ? 'border-primary bg-primary/5' : 'border-transparent'
                  }`}
                >
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    קובץ תוסף (.otzplugin) <span className="text-danger-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept=".otzplugin"
                    onChange={handlePluginFile}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    required
                  />
                  <p className="mt-2 text-sm text-on-surface/60">
                    המערכת תחיל על הטופס את השדות מתוך <code>manifest.json</code>: שם התוסף, מחבר, תיאור קצר, גרסה, סטטוס וגרסת מינימום נתמכת.
                  </p>
                  <p className="mt-1 text-sm text-on-surface/50">
                    טיפ: ניתן גם לגרור את קובץ ה-.otzplugin לכאן.
                  </p>
                  {pluginFile && (
                    <p className="mt-2 text-sm text-success-600">
                      ✓ נבחר: {pluginFile.name}
                    </p>
                  )}
                </div>

                {/* תוכנה נלווית */}
                <div className="rounded-xl border border-neutral-200 p-4">
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    תוכנה נלווית (אופציונלי)
                  </label>
                  <p className="text-sm text-on-surface/60">
                    למלא רק אם התוסף אינו יכול לעבוד לבדו ומדבר עם תוכנה שרצה על המחשב מחוץ לאוצריא.
                    המתקין מועלה כאן ולא בתוך קובץ התוסף: אוצריא מחלצת את החבילה לתיקיית התוסף, ולתוסף
                    אין הרשאת הרצה — קובץ הרצה שנארז בפנים נדחה בהעלאה.
                  </p>
                  <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900">
                    האתר מגיש את המתקין להורדה בדף התוסף, ואינו מריץ אותו — דפדפן אינו מריץ קובץ שהורד.
                    המשתמש מוריד ומריץ בעצמו, ולכן כדאי שהמתקין יתקין את התוכנה בלי שלבים ידניים נוספים.
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-bold text-on-surface/60 mb-2">
                        שם התוכנה
                      </label>
                      <input
                        type="text"
                        value={companion.name}
                        onChange={(e) => setCompanion(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                        placeholder="לדוגמה: מתאם חברותא"
                        maxLength={60}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-on-surface/60 mb-2">
                        גרסת התוכנה (אופציונלי)
                      </label>
                      <input
                        type="text"
                        value={companion.version}
                        onChange={(e) => setCompanion(prev => ({ ...prev, version: e.target.value }))}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                        placeholder="6.0.0"
                        maxLength={40}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-on-surface/60 mb-2">
                        מערכת הפעלה
                      </label>
                      <select
                        value={companion.platform}
                        onChange={(e) => handleCompanionPlatform(e.target.value as 'windows' | 'linux' | 'macos')}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      >
                        <option value="windows">Windows</option>
                        <option value="linux">Linux</option>
                        <option value="macos">macOS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-on-surface/60 mb-2">
                        קובץ המתקין
                      </label>
                      <input
                        type="file"
                        accept={COMPANION_EXTENSIONS[companion.platform].join(',')}
                        onChange={handleCompanionFile}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      />
                      <p className="mt-1 text-sm text-on-surface/50">
                        {COMPANION_EXTENSIONS[companion.platform].join(', ')} · עד {MAX_COMPANION_BYTES / 1024 / 1024}MB
                      </p>
                    </div>
                  </div>

                  <label className="mt-4 flex items-start gap-2 text-sm text-on-surface/70">
                    <input
                      type="checkbox"
                      checked={companion.installsPlugin}
                      onChange={(e) => setCompanion(prev => ({ ...prev, installsPlugin: e.target.checked }))}
                      className="mt-1"
                    />
                    <span>
                      המתקין מתקין בסופו גם את קובץ התוסף באוצריא. סמנו רק אם זה נכון —
                      דף התוסף יציג אז צעד אחד במקום שניים, ומי שיסמן בטעות יישאר בלי תוסף מותקן.
                    </span>
                  </label>

                  {companionFile && (
                    <p className="mt-3 text-sm text-success-600">
                      ✓ נבחר: {companionFile.name}
                    </p>
                  )}
                </div>

                {/* תמונה */}
                <div
                  {...makeDropHandlers(setIsDraggingImage, dropImageFile)}
                  className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                    isDraggingImage ? 'border-primary bg-primary/5' : 'border-transparent'
                  }`}
                >
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    תמונת תוסף (אופציונלי)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFile}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                  <p className="mt-1 text-sm text-on-surface/50">
                    טיפ: ניתן גם לגרור תמונה לכאן.
                  </p>
                  <div className="mt-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900">
                    כדי להגביר את סיכויי הקבלה מומלץ לצרף תמונת תוסף איכותית, ברורה ומתאימה לתוכן התוסף. העלאה ללא תמונה או עם תמונה לא מתאימה עלולה להוביל לדחיית התוסף.
                  </div>
                  {imagePreview && (
                    <div className="mt-4">
                      <img
                        src={imagePreview}
                        alt="תצוגה מקדימה"
                        className="w-full max-w-md h-48 object-cover rounded-xl border border-neutral-200"
                      />
                    </div>
                  )}
                </div>

                {/* צילומי מסך */}
                <div
                  {...makeDropHandlers(setIsDraggingScreenshots, dropScreenshotFiles)}
                  className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                    isDraggingScreenshots ? 'border-primary bg-primary/5' : 'border-transparent'
                  }`}
                >
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    צילומי מסך <span className="text-danger-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleScreenshotFiles}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    required={screenshotFiles.length === 0}
                  />
                  <p className="mt-2 text-sm text-on-surface/60">
                    חובה לצרף לפחות צילום מסך אחד של התוסף. ניתן גם לגרור מספר תמונות לכאן יחד.
                  </p>
                  {screenshotPreviews.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      {screenshotPreviews.map((preview, index) => (
                        <img
                          key={index}
                          src={preview}
                          alt={`צילום מסך ${index + 1}`}
                          className="w-full h-32 object-cover rounded-xl border border-neutral-200"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* כפתורי שליחה */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-4 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'מעלה...' : 'העלה תוסף'}
              </button>
              <Link
                href="/plugins"
                className="px-6 py-4 border border-neutral-200 text-on-surface rounded-xl font-bold hover:bg-neutral-50 transition-colors text-center"
              >
                ביטול
              </Link>
            </div>

            {/* הערה */}
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
              <p className="text-sm text-on-surface/70">
                <strong>שימו לב:</strong> התוסף שלכם יעבור בדיקה ואישור על ידי מנהל לפני שיופיע בחנות התוספים. 
                תקבלו הודעה כאשר התוסף יאושר או אם יש צורך בשינויים.
              </p>
            </div>
          </form>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}

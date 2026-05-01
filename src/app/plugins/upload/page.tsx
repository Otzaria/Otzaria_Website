'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { useDialog } from '@/components/providers/DialogContext'

export default function UploadPluginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert } = useDialog() as { showAlert: (title: string, message: string) => void }
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
    homepage: '',
    installInstructions: [''] as string[]
  })

  // קבצים
  const [pluginFile, setPluginFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([])

  // תגית חדשה
  const [newTag, setNewTag] = useState('')

  // טיפול בשינוי שדות
  const handleChange = (field: string, value: any) => {
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

  // הוספת הוראת התקנה
  const addInstruction = () => {
    handleChange('installInstructions', [...formData.installInstructions, ''])
  }

  // עדכון הוראת התקנה
  const updateInstruction = (index: number, value: string) => {
    const updated = [...formData.installInstructions]
    updated[index] = value
    handleChange('installInstructions', updated)
  }

  // הסרת הוראת התקנה
  const removeInstruction = (index: number) => {
    handleChange('installInstructions', formData.installInstructions.filter((_, i) => i !== index))
  }

  // מגבלות חייבות להיות עקביות עם השרת ([src/app/api/plugins/upload/route.js]).
  const MAX_PLUGIN_BYTES = 50 * 1024 * 1024
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024
  const MAX_SCREENSHOTS = 10
  const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  const VERSION_RE = /^\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.]+)?$/

  // טיפול בקובץ תוסף
  const handlePluginFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.toLowerCase().endsWith('.otzplugin')) {
        showAlert('שגיאה', 'קובץ התוסף חייב להיות בפורמט .otzplugin')
        return
      }
      if (file.size > MAX_PLUGIN_BYTES) {
        showAlert('שגיאה', `קובץ התוסף חורג מהמגבלה של ${MAX_PLUGIN_BYTES / 1024 / 1024}MB`)
        return
      }
      setPluginFile(file)
    }
  }

  // טיפול בתמונה
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
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
  }

  // טיפול בצילומי מסך
  const handleScreenshotFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
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
    
    // יצירת תצוגות מקדימות
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

  // שליחת הטופס
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // בדיקות
      if (!pluginFile) {
        throw new Error('חובה לצרף קובץ תוסף')
      }

      if (!formData.name || !formData.shortDescription || !formData.description ||
          !formData.version || !formData.author || !formData.compatibleWith) {
        throw new Error('נא למלא את כל השדות החובה')
      }

      if (!VERSION_RE.test(formData.version.trim())) {
        throw new Error('פורמט גרסה לא תקין (לדוגמה 1.0.0 או 1.2.3-beta)')
      }

      if (formData.homepage) {
        try {
          const u = new URL(formData.homepage)
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            throw new Error('protocol')
          }
        } catch {
          throw new Error('כתובת אתר הבית חייבת להתחיל ב-http:// או https://')
        }
      }

      if (!['stable', 'beta', 'experimental'].includes(formData.status)) {
        throw new Error('סטטוס לא תקין')
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
      
      // סינון הוראות התקנה ריקות
      const instructions = formData.installInstructions.filter(i => i.trim())
      data.append('installInstructions', JSON.stringify(instructions))
      
      data.append('pluginFile', pluginFile)
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

      await showAlert('הצלחה', 'התוסף הועלה בהצלחה ונשלח לאישור מנהל. לאחר האישור הוא יופיע בחנות התוספים.')
      router.push('/plugins')
    } catch (err: any) {
      showAlert('שגיאה', err.message || 'שגיאה בהעלאת התוסף')
    } finally {
      setLoading(false)
    }
  }

  // בדיקת התחברות
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-on-surface/50 font-medium">טוען...</p>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="bg-white rounded-2xl border border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-on-surface mb-4">נדרשת התחברות</h2>
              <p className="text-on-surface/70 mb-6">
                כדי להעלות תוסף לחנות, עליך להתחבר תחילה
              </p>
              <Link
                href="/api/auth/signin"
                className="inline-block px-6 py-3 bg-primary text-white rounded-full font-bold hover:bg-primary/90 transition-colors"
              >
                התחבר
              </Link>
            </div>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader />
      
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
            <section className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-2xl font-bold text-on-surface mb-6">מידע בסיסי</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    שם התוסף <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    placeholder="לדוגמה: תוסף מילון"
                    maxLength={100}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    תיאור קצר <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.shortDescription}
                    onChange={(e) => handleChange('shortDescription', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    placeholder="תיאור קצר של התוסף (עד 150 תווים)"
                    maxLength={150}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    תיאור מלא <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 min-h-[150px]"
                    placeholder="תיאור מפורט של התוסף, מה הוא עושה ואיך להשתמש בו"
                    maxLength={10000}
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-on-surface/60 mb-2">
                      גרסה <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={(e) => handleChange('version', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      placeholder="לדוגמה: 1.0.0"
                      pattern="^\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.]+)?$"
                      title="פורמט: X או X.Y או X.Y.Z, אופציונלי -beta וכד'"
                      maxLength={30}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-on-surface/60 mb-2">
                      סטטוס <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      required
                    >
                      <option value="stable">יציב</option>
                      <option value="beta">בטא</option>
                      <option value="experimental">ניסיוני</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-on-surface/60 mb-2">
                      שם המפתח <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.author}
                      onChange={(e) => handleChange('author', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      placeholder="שמך או שם הארגון"
                      maxLength={100}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-on-surface/60 mb-2">
                      תאימות <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.compatibleWith}
                      onChange={(e) => handleChange('compatibleWith', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      placeholder="לדוגמה: אוצריא 5.0+"
                      maxLength={100}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    אתר בית (אופציונלי)
                  </label>
                  <input
                    type="url"
                    value={formData.homepage}
                    onChange={(e) => handleChange('homepage', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    placeholder="https://example.com"
                    maxLength={500}
                    pattern="https?://.+"
                  />
                </div>
              </div>
            </section>

            {/* תגיות */}
            <section className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-2xl font-bold text-on-surface mb-6">תגיות</h2>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
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

            {/* הוראות התקנה */}
            <section className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-2xl font-bold text-on-surface mb-6">הוראות התקנה</h2>
              
              <div className="space-y-4">
                {formData.installInstructions.map((instruction, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-sm mt-2">
                      {index + 1}
                    </div>
                    <input
                      type="text"
                      value={instruction}
                      onChange={(e) => updateInstruction(index, e.target.value)}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      placeholder={`שלב ${index + 1}`}
                      maxLength={500}
                    />
                    {formData.installInstructions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInstruction(index)}
                        className="flex-shrink-0 w-10 h-10 text-red-500 hover:bg-red-50 rounded-xl transition-colors mt-2"
                      >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={addInstruction}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 text-on-surface/60 rounded-xl hover:border-primary hover:text-primary transition-colors font-medium"
                >
                  + הוסף שלב
                </button>
              </div>
            </section>

            {/* קבצים */}
            <section className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-2xl font-bold text-on-surface mb-6">קבצים</h2>
              
              <div className="space-y-6">
                {/* קובץ תוסף */}
                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    קובץ תוסף (.otzplugin) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept=".otzplugin"
                    onChange={handlePluginFile}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    required
                  />
                  {pluginFile && (
                    <p className="mt-2 text-sm text-green-600">
                      ✓ נבחר: {pluginFile.name}
                    </p>
                  )}
                </div>

                {/* תמונה */}
                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    תמונת תוסף (אופציונלי)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFile}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                  {imagePreview && (
                    <div className="mt-4">
                      <img
                        src={imagePreview}
                        alt="תצוגה מקדימה"
                        className="w-full max-w-md h-48 object-cover rounded-xl border border-gray-200"
                      />
                    </div>
                  )}
                </div>

                {/* צילומי מסך */}
                <div>
                  <label className="block text-sm font-bold text-on-surface/60 mb-2">
                    צילומי מסך (אופציונלי)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleScreenshotFiles}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                  {screenshotPreviews.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      {screenshotPreviews.map((preview, index) => (
                        <img
                          key={index}
                          src={preview}
                          alt={`צילום מסך ${index + 1}`}
                          className="w-full h-32 object-cover rounded-xl border border-gray-200"
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
                className="px-6 py-4 border border-gray-200 text-on-surface rounded-xl font-bold hover:bg-gray-50 transition-colors text-center"
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

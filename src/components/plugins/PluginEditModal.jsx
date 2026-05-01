'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { useDialog } from '@/components/providers/DialogContext'

const VERSION_RE = /^\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.]+)?$/
const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export default function PluginEditModal({ plugin, endpoint, onClose, onSuccess }) {
  const { data: session } = useSession()
  const { showAlert } = useDialog()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const isAdmin = session?.user?.role === 'admin'
  const originalVersion = plugin.version || ''

  const [formData, setFormData] = useState({
    name: plugin.name || '',
    shortDescription: plugin.shortDescription || '',
    description: plugin.description || '',
    version: plugin.version || '',
    status: plugin.status || 'stable',
    author: plugin.author || '',
    compatibleWith: plugin.compatibleWith || '',
    tags: plugin.tags || [],
    homepage: plugin.homepage || '',
    installInstructions: plugin.installInstructions?.length ? plugin.installInstructions : ['']
  })

  const [pluginFile, setPluginFile] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [screenshotFiles, setScreenshotFiles] = useState([])
  const [imagePreview, setImagePreview] = useState(null)
  const [screenshotPreviews, setScreenshotPreviews] = useState([])
  const [removeImage, setRemoveImage] = useState(false)
  const [removeScreenshots, setRemoveScreenshots] = useState(false)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const addTag = () => {
    const value = newTag.trim()
    if (value && !formData.tags.includes(value)) {
      handleChange('tags', [...formData.tags, value])
      setNewTag('')
    }
  }

  const removeTag = (tag) => {
    handleChange('tags', formData.tags.filter((item) => item !== tag))
  }

  const addInstruction = () => {
    handleChange('installInstructions', [...formData.installInstructions, ''])
  }

  const updateInstruction = (index, value) => {
    const next = [...formData.installInstructions]
    next[index] = value
    handleChange('installInstructions', next)
  }

  const removeInstruction = (index) => {
    handleChange('installInstructions', formData.installInstructions.filter((_, currentIndex) => currentIndex !== index))
  }

  const handlePluginFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.otzplugin')) {
      showAlert('שגיאה', 'קובץ התוסף חייב להיות בפורמט .otzplugin')
      return
    }
    setPluginFile(file)
  }

  const handleImageFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
      showAlert('שגיאה', 'תמונה חייבת להיות בפורמט PNG, JPEG, WEBP או GIF')
      return
    }
    setImageFile(file)
    setRemoveImage(false)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const handleScreenshotFiles = (event) => {
    const files = Array.from(event.target.files || [])
    for (const file of files) {
      if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
        showAlert('שגיאה', 'צילומי מסך חייבים להיות בפורמט PNG, JPEG, WEBP או GIF')
        return
      }
    }

    setScreenshotFiles(files)
    setRemoveScreenshots(false)

    const previews = []
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        previews.push(reader.result)
        if (previews.length === files.length) {
          setScreenshotPreviews(previews)
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)

    try {
      if (!formData.name || !formData.shortDescription || !formData.description || !formData.version || !formData.author || !formData.compatibleWith) {
        throw new Error('נא למלא את כל שדות החובה לפני השמירה.')
      }

      if (!VERSION_RE.test(formData.version.trim())) {
        throw new Error('פורמט גרסה לא תקין (לדוגמה 1.0.0 או 1.2.3-beta)')
      }

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
      data.append(
        'installInstructions',
        JSON.stringify(formData.installInstructions.filter((instruction) => instruction.trim()))
      )

      if (pluginFile) {
        data.append('pluginFile', pluginFile)
      }
      if (removeImage) {
        data.append('removeImage', 'true')
      } else if (imageFile) {
        data.append('imageFile', imageFile)
      }
      if (removeScreenshots) {
        data.append('removeScreenshots', 'true')
      } else {
        screenshotFiles.forEach((file) => data.append('screenshots', file))
      }

      const response = await fetch(endpoint, {
        method: 'PUT',
        body: data
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בעדכון התוסף')
      }

      onSuccess?.(result)
    } catch (error) {
      showAlert('שגיאה', error.message || 'שגיאה בעדכון התוסף')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6">
          <h2 className="text-2xl font-bold text-on-surface">עריכת תוסף</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {!isAdmin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              כל שינוי יישלח לאישור מנהל לפני שיתעדכן בחנות. מספר גרסה חדש נדרש רק אם מחליפים את קובץ התוסף.
            </div>
          )}

          <section className="space-y-4">
            <h3 className="text-xl font-bold text-on-surface">מידע בסיסי</h3>
            <input type="text" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="שם התוסף" required />
            <input type="text" value={formData.shortDescription} onChange={(e) => handleChange('shortDescription', e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="תיאור קצר" maxLength={150} required />
            <textarea value={formData.description} onChange={(e) => handleChange('description', e.target.value)} className="min-h-[150px] w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="תיאור מלא" required />

            <div className="grid gap-4 md:grid-cols-2">
              <input type="text" value={formData.version} onChange={(e) => handleChange('version', e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="גרסה" required />
              <select value={formData.status} onChange={(e) => handleChange('status', e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" required>
                <option value="stable">יציב</option>
                <option value="beta">בטא</option>
                <option value="experimental">ניסיוני</option>
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input type="text" value={formData.author} onChange={(e) => handleChange('author', e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="שם המפתח" required />
              <input type="text" value={formData.compatibleWith} onChange={(e) => handleChange('compatibleWith', e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="תאימות" required />
            </div>

            <input type="url" value={formData.homepage} onChange={(e) => handleChange('homepage', e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="אתר בית (אופציונלי)" />
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold text-on-surface">תגיות</h3>
            <div className="flex gap-2">
              <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="הוסף תגית" />
              <button type="button" onClick={addTag} className="rounded-xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90">הוסף</button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-primary/70">
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold text-on-surface">הוראות התקנה</h3>
            {formData.installInstructions.map((instruction, index) => (
              <div key={index} className="flex gap-2">
                <div className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </div>
                <input type="text" value={instruction} onChange={(e) => updateInstruction(index, e.target.value)} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder={`שלב ${index + 1}`} />
                {formData.installInstructions.length > 1 && (
                  <button type="button" onClick={() => removeInstruction(index)} className="mt-2 rounded-xl px-3 text-red-500 transition-colors hover:bg-red-50">
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addInstruction} className="w-full rounded-xl border-2 border-dashed border-gray-300 px-4 py-3 font-medium text-on-surface/60 transition-colors hover:border-primary hover:text-primary">
              + הוסף שלב
            </button>
          </section>

          <section className="space-y-6">
            <h3 className="text-xl font-bold text-on-surface">קבצים</h3>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">קובץ תוסף (.otzplugin)</label>
              <input type="file" accept=".otzplugin" onChange={handlePluginFile} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" />
              {pluginFile && <p className="mt-2 text-sm text-green-600">✓ נבחר: {pluginFile.name}</p>}
              {plugin.pluginFileName && <p className="mt-2 text-sm text-on-surface/50">קובץ נוכחי: {plugin.pluginFileName}</p>}
              {!isAdmin && <p className="mt-2 text-sm text-on-surface/50">אם מעלים קובץ חדש, צריך לעדכן גם את מספר הגרסה הנוכחי ({originalVersion}).</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">תמונת תוסף</label>
              <input type="file" accept="image/*" onChange={handleImageFile} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" />
              {imagePreview ? (
                <img src={imagePreview} alt="תצוגה מקדימה" className="mt-4 h-48 w-full max-w-md rounded-xl border border-gray-200 object-cover" />
              ) : plugin.imageData && !removeImage ? (
                <div className="mt-4">
                  <img src={plugin.image} alt="תמונה נוכחית" className="h-48 w-full max-w-md rounded-xl border border-gray-200 object-cover" />
                  <button type="button" onClick={() => setRemoveImage(true)} className="mt-2 text-sm text-red-600 hover:underline">הסר תמונה</button>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">צילומי מסך</label>
              <input type="file" accept="image/*" multiple onChange={handleScreenshotFiles} className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" />
              {screenshotPreviews.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                  {screenshotPreviews.map((preview, index) => (
                    <img key={index} src={preview} alt={`צילום מסך ${index + 1}`} className="h-32 w-full rounded-xl border border-gray-200 object-cover" />
                  ))}
                </div>
              ) : plugin.screenshots?.length > 0 && !removeScreenshots ? (
                <div className="mt-4">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {plugin.screenshots.map((screenshot, index) => (
                      <img key={index} src={screenshot} alt={`צילום מסך ${index + 1}`} className="h-32 w-full rounded-xl border border-gray-200 object-cover" />
                    ))}
                  </div>
                  <button type="button" onClick={() => setRemoveScreenshots(true)} className="mt-2 text-sm text-red-600 hover:underline">הסר כל צילומי המסך</button>
                </div>
              ) : null}
            </div>
          </section>

          <div className="flex gap-4 border-t border-gray-200 pt-4">
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary px-6 py-4 font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? 'שומר...' : isAdmin ? 'שמור שינויים' : 'שמור ושלח לאישור'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-4 font-bold text-on-surface transition-colors hover:bg-gray-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

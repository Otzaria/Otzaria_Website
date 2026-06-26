'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { useDialog } from '@/components/providers/DialogContext'
import { MIN_SUPPORTED_APP_VERSION, formatPluginStatus } from '@/lib/pluginSubmission'

const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const STATUS_OPTIONS = [
  { value: 'stable', label: 'יציב' },
  { value: 'beta', label: 'בטא' },
  { value: 'experimental', label: 'ניסיוני' }
]

async function readPluginManifest(file) {
  const { unzipSync } = await import('fflate')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const unzipped = unzipSync(bytes, { filter: (info) => info.name === 'manifest.json' })
  const manifestBytes = unzipped['manifest.json']
  if (!manifestBytes) throw new Error('manifest.json not found in plugin file')
  return JSON.parse(new TextDecoder().decode(manifestBytes))
}

function versionAtLeast(v, min) {
  const parse = (s) => s.split('.').map(Number)
  const va = parse(v), vm = parse(min)
  for (let i = 0; i < Math.max(va.length, vm.length); i++) {
    const a = va[i] ?? 0, b = vm[i] ?? 0
    if (a !== b) return a > b
  }
  return true
}

// השוואה מספרית של גרסאות (בדיקת UX בלבד — השרת הוא מקור האמת). 1: a>b, -1: a<b, 0: שווה.
// מפריד תחילה את חלק ה-prerelease (אחרי '-') כדי שלא ננסה להמיר תווים לא-מספריים ל-Number
// (מה שמחזיר NaN). לפי SemVer גרסה עם prerelease קטנה מהגרסה היציבה התואמת.
function compareVersionsNumeric(a, b) {
  const [coreA] = (a || '').split('+')[0].split('-')
  const [coreB] = (b || '').split('+')[0].split('-')
  const preA = (a || '').split('+')[0].slice(coreA.length + 1)
  const preB = (b || '').split('+')[0].slice(coreB.length + 1)
  const pa = coreA.split('.').map(Number)
  const pb = coreB.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  if (preA && !preB) return -1
  if (!preA && preB) return 1
  if (preA && preB) {
    const cmp = preA.localeCompare(preB)
    return cmp === 0 ? 0 : (cmp > 0 ? 1 : -1)
  }
  return 0
}

function buildManifestDiff(manifest, current) {
  const manifestValues = {
    name: (typeof manifest.name === 'string' ? manifest.name : '').trim(),
    author: (typeof manifest.author === 'string' ? manifest.author : '').trim(),
    version: (typeof manifest.version === 'string' ? manifest.version : '').trim(),
    shortDescription: (typeof manifest.description === 'string' ? manifest.description : '').trim(),
    status: (typeof manifest.stability === 'string' ? manifest.stability : '').trim(),
    compatibleWith: (typeof manifest.minAppVersion === 'string' ? manifest.minAppVersion : '').trim(),
    homepage: (typeof manifest.homepage === 'string' ? manifest.homepage : '').trim(),
    requiresNetwork: manifest.network?.enabled === true
  }

  const labels = {
    name: 'שם התוסף',
    author: 'מפתח',
    version: 'גרסה',
    shortDescription: 'תיאור קצר',
    status: 'סטטוס',
    compatibleWith: 'גרסת מינימום',
    homepage: 'אתר בית',
    requiresNetwork: 'חיבור אינטרנט'
  }

  const formatValue = (field, value) => {
    if (field === 'requiresNetwork') return value ? 'נדרש' : 'לא נדרש'
    if (field === 'status') return formatPluginStatus(value) || value || 'ללא'
    return value || 'ללא'
  }

  const changes = []
  for (const field of Object.keys(labels)) {
    const newValue = manifestValues[field]
    const oldValue = current[field]

    if (field === 'requiresNetwork') {
      if (newValue !== (oldValue === true)) {
        changes.push({ field, label: labels[field], before: formatValue(field, oldValue === true), after: formatValue(field, newValue), value: newValue })
      }
      continue
    }

    if (field === 'status') {
      if (newValue && ['stable', 'beta', 'experimental'].includes(newValue) && newValue !== oldValue) {
        changes.push({ field, label: labels[field], before: formatValue(field, oldValue), after: formatValue(field, newValue), value: newValue })
      }
      continue
    }

    if (newValue && newValue !== (oldValue || '').trim()) {
      changes.push({ field, label: labels[field], before: formatValue(field, oldValue), after: formatValue(field, newValue), value: newValue })
    }
  }

  return changes
}

export default function PluginEditModal({ plugin, endpoint, onClose, onSuccess }) {
  const { data: session } = useSession()
  const { showAlert, showConfirm, showMessage } = useDialog()
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
    requiresNetwork: plugin.requiresNetwork === true,
    tags: plugin.tags || [],
    homepage: plugin.homepage || ''
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

  const handlePluginFile = async (event) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.otzplugin')) {
      showAlert('שגיאה', 'קובץ התוסף חייב להיות בפורמט .otzplugin')
      input.value = ''
      return
    }
    let manifest
    try {
      manifest = await readPluginManifest(file)
    } catch (err) {
      showAlert('שגיאה', `לא ניתן לקרוא את manifest.json מקובץ התוסף: ${err?.message || err}`)
      input.value = ''
      return
    }
    const manifestId = (typeof manifest.id === 'string' ? manifest.id : '').trim()
    const manifestVersion = (typeof manifest.version === 'string' ? manifest.version : '').trim()
    const manifestName = (typeof manifest.name === 'string' ? manifest.name : '').trim()
    const manifestAuthor = (typeof manifest.author === 'string' ? manifest.author : '').trim()
    const manifestDesc = (typeof manifest.description === 'string' ? manifest.description : '').trim()
    const stability = (typeof manifest.stability === 'string' ? manifest.stability : '').trim()
    const minAppVersion = (typeof manifest.minAppVersion === 'string' ? manifest.minAppVersion : '').trim()
    const manifestHomepage = (typeof manifest.homepage === 'string' ? manifest.homepage : '').trim()
    if (!manifestVersion) {
      showAlert('שגיאה', 'חסר שדה גרסה ב-manifest.json של קובץ התוסף')
      input.value = ''
      return
    }
    // המזהה (id) חייב להופיע ולהישאר זהה למזהה הקיים של התוסף.
    if (!manifestId) {
      showAlert('שגיאה', 'חסר שדה id ב-manifest.json של קובץ התוסף')
      input.value = ''
      return
    }
    const existingUid = (plugin.pluginUid || '').trim()
    if (existingUid && manifestId !== existingUid) {
      showAlert('שגיאה', `המזהה (id) בקובץ (${manifestId}) חייב להיות זהה למזהה הקיים של התוסף (${existingUid})`)
      input.value = ''
      return
    }
    // אי-ירידת גרסה: היוצר חייב גרסה גבוהה מהנוכחית; מנהל רשאי גם אותה גרסה אך לא לשנמך.
    const versionCmp = compareVersionsNumeric(manifestVersion, originalVersion)
    if (!isAdmin && versionCmp <= 0) {
      showAlert('שגיאה', `הגרסה בקובץ (${manifestVersion}) חייבת להיות גבוהה מהגרסה הנוכחית (${originalVersion})`)
      input.value = ''
      return
    }
    if (isAdmin && versionCmp < 0) {
      showAlert('שגיאה', `לא ניתן להוריד את הגרסה. הגרסה בקובץ (${manifestVersion}) חייבת להיות זהה או גבוהה מהגרסה הנוכחית (${originalVersion})`)
      input.value = ''
      return
    }
    if (!isAdmin && (!stability || !['stable', 'beta', 'experimental'].includes(stability))) {
      showAlert('שגיאה', 'חסר שדה stability תקין ב-manifest.json (ערכים מותרים: stable, beta, experimental)')
      input.value = ''
      return
    }
    if (!isAdmin && !minAppVersion) {
      showAlert('שגיאה', 'חסר שדה minAppVersion ב-manifest.json של קובץ התוסף')
      input.value = ''
      return
    }
    if (!isAdmin && !versionAtLeast(minAppVersion, MIN_SUPPORTED_APP_VERSION)) {
      showAlert('שגיאה', `גרסת המינימום (${minAppVersion}) לא יכולה להיות פחות מ-${MIN_SUPPORTED_APP_VERSION}`)
      input.value = ''
      return
    }
    if (!isAdmin) {
      handleChange('version', manifestVersion)
      if (manifestName) handleChange('name', manifestName)
      if (manifestAuthor) handleChange('author', manifestAuthor)
      if (manifestDesc) handleChange('shortDescription', manifestDesc)
      handleChange('status', stability)
      handleChange('compatibleWith', minAppVersion)
      handleChange('homepage', manifestHomepage)
      handleChange('requiresNetwork', manifest.network?.enabled === true)
    } else {
      const diff = buildManifestDiff(manifest, formData)
      if (diff.length > 0) {
        const lines = diff.map((change) => `• ${change.label}\n   לפני: ${change.before}\n   אחרי: ${change.after}`)
        const message = `בקובץ התוסף החדש נמצאו ערכים שונים מהשדות בטופס:\n\n${lines.join('\n\n')}\n\nלהחליף את הערכים בטופס לפי הקובץ?`
        const apply = await showConfirm('עדכון שדות לפי הקובץ', message)
        if (apply) {
          setFormData((prev) => ({
            ...prev,
            ...Object.fromEntries(diff.map((change) => [change.field, change.value]))
          }))
        }
      }
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

      const data = new FormData()
      data.append('name', formData.name)
      data.append('shortDescription', formData.shortDescription)
      data.append('description', formData.description)
      data.append('version', formData.version)
      data.append('status', formData.status)
      data.append('author', formData.author)
      data.append('compatibleWith', formData.compatibleWith)
      data.append('requiresNetwork', formData.requiresNetwork ? 'true' : 'false')
      data.append('tags', JSON.stringify(formData.tags))
      data.append('homepage', formData.homepage)

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
      // דיאלוג מודאלי חוסם — לא נעלם עד שלוחצים אישור, כדי שניתן יהיה לקרוא הודעות שגיאה ארוכות
      // (למשל פירוט ולידציה מול ה-SDK שמחזיר השרת בעת החלפת קובץ תוסף).
      await showMessage('שגיאה בעדכון התוסף', error.message || 'שגיאה בעדכון התוסף')
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
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white p-6">
          <h2 className="text-2xl font-bold text-on-surface">עריכת תוסף</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {!isAdmin && (
            <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 text-on-surface/70 text-sm">
              בעת החלפת קובץ התוסף, שם התוסף, המפתח והגרסה יזוהו אוטומטית מ-manifest.json — הגרסה חייבת להיות גבוהה מהנוכחית.
            </div>
          )}

          <section className="space-y-4">
            <h3 className="text-xl font-bold text-on-surface">מידע בסיסי</h3>
            {isAdmin ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="שם התוסף" required />
                  <input value={formData.author} onChange={(e) => handleChange('author', e.target.value)} className="rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="מפתח" required />
                  <input value={formData.version} onChange={(e) => handleChange('version', e.target.value)} className="rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="גרסה" required />
                  <input value={formData.compatibleWith} onChange={(e) => handleChange('compatibleWith', e.target.value)} className="rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="גרסת מינימום" required />
                  <input value={formData.shortDescription} onChange={(e) => handleChange('shortDescription', e.target.value)} className="md:col-span-2 rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="תיאור קצר" required />
                  <input value={formData.homepage} onChange={(e) => handleChange('homepage', e.target.value)} className="md:col-span-2 rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="אתר בית (אופציונלי)" />
                  <select value={formData.status} onChange={(e) => handleChange('status', e.target.value)} className="rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10">
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.requiresNetwork}
                    onChange={(e) => handleChange('requiresNetwork', e.target.checked)}
                    className="h-5 w-5 rounded border-neutral-300 text-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="material-symbols-outlined text-primary">
                    {formData.requiresNetwork ? 'wifi' : 'wifi_off'}
                  </span>
                  <span className="font-medium text-on-surface">התוסף דורש חיבור אינטרנט</span>
                </label>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-on-surface/70">
                  שאר המידע יילקח מקובץ התוסף.
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm text-on-surface/70">
                  <span className="material-symbols-outlined text-primary">
                    {formData.requiresNetwork ? 'wifi' : 'wifi_off'}
                  </span>
                  <span>
                    חיבור אינטרנט: <strong>{formData.requiresNetwork ? 'נדרש' : 'לא נדרש'}</strong>
                    {' '}(נקבע אוטומטית מ-<code>network.enabled</code> ב-manifest.json)
                  </span>
                </div>
              </>
            )}
            <textarea value={formData.description} onChange={(e) => handleChange('description', e.target.value)} className="min-h-[150px] w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="תיאור מלא" required />
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold text-on-surface">תגיות</h3>
            <div className="flex gap-2">
              <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} className="flex-1 rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" placeholder="הוסף תגית" />
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

          <section className="space-y-6">
            <h3 className="text-xl font-bold text-on-surface">קבצים</h3>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">קובץ תוסף (.otzplugin)</label>
              <input type="file" accept=".otzplugin" onChange={handlePluginFile} className="w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" />
              {pluginFile && <p className="mt-2 text-sm text-success-600">✓ נבחר: {pluginFile.name}</p>}
              {plugin.pluginFileName && <p className="mt-2 text-sm text-on-surface/50">קובץ נוכחי: {plugin.pluginFileName}</p>}
              {isAdmin && <p className="mt-2 text-sm text-on-surface/50">למנהל, החלפת הקובץ אינה משנה אוטומטית את השדות הידניים. ניתן לשמור על אותה גרסה אך לא לשנמך, והמזהה (id) ב-manifest.json חייב להישאר זהה.</p>}
              {!isAdmin && <p className="mt-2 text-sm text-on-surface/50">אם מעלים קובץ חדש, הגרסה תזוהה אוטומטית מ-manifest.json ועליה להיות גבוהה מהגרסה הנוכחית ({originalVersion}). המזהה (id) חייב להישאר זהה.</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">תמונת תוסף</label>
              <input type="file" accept="image/*" onChange={handleImageFile} className="w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" />
              {imagePreview ? (
                <img src={imagePreview} alt="תצוגה מקדימה" className="mt-4 h-48 w-full max-w-md rounded-xl border border-neutral-200 object-cover" />
              ) : plugin.imageData && !removeImage ? (
                <div className="mt-4">
                  <img src={plugin.image} alt="תמונה נוכחית" className="h-48 w-full max-w-md rounded-xl border border-neutral-200 object-cover" />
                  <button type="button" onClick={() => setRemoveImage(true)} className="mt-2 text-sm text-danger-600 hover:underline">הסר תמונה</button>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">צילומי מסך</label>
              <input type="file" accept="image/*" multiple onChange={handleScreenshotFiles} className="w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10" />
              {screenshotPreviews.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                  {screenshotPreviews.map((preview, index) => (
                    <img key={index} src={preview} alt={`צילום מסך ${index + 1}`} className="h-32 w-full rounded-xl border border-neutral-200 object-cover" />
                  ))}
                </div>
              ) : plugin.screenshots?.length > 0 && !removeScreenshots ? (
                <div className="mt-4">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {plugin.screenshots.map((screenshot, index) => (
                      <img key={index} src={screenshot} alt={`צילום מסך ${index + 1}`} className="h-32 w-full rounded-xl border border-neutral-200 object-cover" />
                    ))}
                  </div>
                  <button type="button" onClick={() => setRemoveScreenshots(true)} className="mt-2 text-sm text-danger-600 hover:underline">הסר את כל צילומי המסך</button>
                </div>
              ) : null}
            </div>
          </section>

          <div className="flex gap-4 border-t border-neutral-200 pt-4">
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary px-6 py-4 font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? 'שומר...' : 'שמור שינויים'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-neutral-200 px-6 py-4 font-bold text-on-surface transition-colors hover:bg-neutral-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

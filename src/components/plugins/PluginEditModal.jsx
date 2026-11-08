'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import AppIcon from '@/components/ui/AppIcon'
import FormField from '@/components/plugins/form/FormField'
import FormNote from '@/components/plugins/form/FormNote'
import FileDropZone from '@/components/plugins/form/FileDropZone'
import TagInput from '@/components/plugins/form/TagInput'
import { usePluginTagSuggestions } from '@/components/plugins/form/usePluginTagSuggestions'
import CheckboxField from '@/components/plugins/form/CheckboxField'
import { IconPreview, ScreenshotPreviews, SelectedFile } from '@/components/plugins/form/FilePreviews'
import { fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'
import { useDialog } from '@/components/providers/DialogContext'
import { MIN_SUPPORTED_APP_VERSION, formatPluginStatus } from '@/lib/pluginStatus'
import { normalizeTagList } from '@/lib/pluginTags'

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
  if (!manifestBytes) throw new Error('missing manifest')
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
    status: 'רמת יציבות',
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
  const [loading, setLoading] = useState(false)
  // חלון אישור של DialogContext פתוח מעל החלון הזה — Esc לא יסגור את העריכה מתחתיו
  const [confirming, setConfirming] = useState(false)
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
    // מנורמלות כבר בפתיחה (פיצול פסיקים, גרשיים, כפילויות) — מה שרואים הוא מה שיישמר
    tags: normalizeTagList(plugin.tags || []),
    homepage: plugin.homepage || ''
  })

  const [pluginFile, setPluginFile] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [screenshotFiles, setScreenshotFiles] = useState([])
  const [imagePreview, setImagePreview] = useState(null)
  const [screenshotPreviews, setScreenshotPreviews] = useState([])
  const [removeImage, setRemoveImage] = useState(false)
  const [removeScreenshots, setRemoveScreenshots] = useState(false)
  const tagSuggestions = usePluginTagSuggestions()

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
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
      showAlert('שגיאה', 'קובץ התוסף פגום: לא הצלחנו לקרוא ממנו את פרטי התוסף. בדוק שזה הקובץ הנכון.')
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
      showAlert('שגיאה', 'קובץ התוסף פגום: חסר בו מספר גרסה.')
      input.value = ''
      return
    }
    // המזהה (id) חייב להופיע ולהישאר זהה למזהה הקיים של התוסף.
    if (!manifestId) {
      showAlert('שגיאה', 'קובץ התוסף פגום: חסר בו המזהה של התוסף.')
      input.value = ''
      return
    }
    const existingUid = (plugin.pluginUid || '').trim()
    if (existingUid && manifestId !== existingUid) {
      showAlert('שגיאה', `זה קובץ של תוסף אחר: המזהה בו (${manifestId}) שונה מהמזהה של התוסף הזה (${existingUid}).`)
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
      showAlert('שגיאה', 'קובץ התוסף פגום: חסרה בו רמת היציבות (יציב, בטא או ניסיוני).')
      input.value = ''
      return
    }
    if (!isAdmin && !minAppVersion) {
      showAlert('שגיאה', 'קובץ התוסף פגום: חסרה בו גרסת אוצריא המינימלית.')
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
        setConfirming(true)
        const apply = await showConfirm('עדכון שדות לפי הקובץ', message).finally(() => setConfirming(false))
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
      data.append('tags', JSON.stringify(normalizeTagList(formData.tags)))
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

  const field = (id, label, key, { required = true, ltr = false, className } = {}) => (
    <FormField id={id} label={label} required={required} className={className}>
      <input
        value={formData[key]}
        onChange={(e) => handleChange(key, e.target.value)}
        className={fieldClasses()}
        required={required}
        dir={ltr ? 'ltr' : undefined}
        {...fieldA11yProps(id, { required })}
      />
    </FormField>
  )

  return (
    <Dialog
      title="עריכת תוסף"
      subtitle={plugin.name}
      onClose={onClose}
      // בזמן שמירה או כשחלון אישור/הודעה פתוח מעליו — רק "ביטול" סוגר (לא Esc/רקע)
      dismissible={!loading && !confirming}
      className="[--dialog-width:48rem]"
      footer={
        <>
          <Button type="submit" form={EDIT_FORM_ID} variant="filled" icon="save" loading={loading} className="flex-1 sm:flex-none">
            {loading ? 'שומר...' : 'שמור שינויים'}
          </Button>
          <Button type="button" variant="outlined" onClick={onClose} className="flex-1 sm:flex-none">
            ביטול
          </Button>
        </>
      }
    >
      <form id={EDIT_FORM_ID} onSubmit={handleSubmit} className="space-y-8">
        {!isAdmin && (
          <FormNote>
            בעת החלפת קובץ התוסף, שם התוסף, המפתח והגרסה יזוהו אוטומטית מ-<code dir="ltr">manifest.json</code> — הגרסה חייבת להיות גבוהה מהנוכחית.
          </FormNote>
        )}

        <EditSection id="edit-section-basic" title="מידע בסיסי">
          {isAdmin ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {field('edit-name', 'שם התוסף', 'name')}
                {field('edit-author', 'מפתח', 'author')}
                {field('edit-version', 'גרסה', 'version', { ltr: true })}
                {field('edit-compatible', 'גרסת מינימום', 'compatibleWith', { ltr: true })}
                {field('edit-short-description', 'תיאור קצר', 'shortDescription', { className: 'md:col-span-2' })}
                {field('edit-homepage', 'אתר בית (אופציונלי)', 'homepage', { required: false, ltr: true, className: 'md:col-span-2' })}
                <FormField id="edit-status" label="רמת יציבות">
                  <select
                    id="edit-status"
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className={fieldClasses({ kind: 'select' })}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <CheckboxField
                id="edit-requires-network"
                checked={formData.requiresNetwork}
                onChange={(checked) => handleChange('requiresNetwork', checked)}
                icon={<AppIcon name={formData.requiresNetwork ? 'wifi' : 'wifi_off'} className="mt-0.5 text-[1.25rem] text-primary" />}
                label="התוסף דורש חיבור אינטרנט"
              />
            </>
          ) : (
            <>
              <FormNote>שאר המידע יילקח מקובץ התוסף.</FormNote>
              <div className="flex items-start gap-3 rounded-(--radius-control) border border-outline-variant px-4 py-3 text-body-sm text-on-surface-variant">
                <AppIcon name={formData.requiresNetwork ? 'wifi' : 'wifi_off'} className="mt-0.5 text-[1.25rem] text-primary" />
                <span>
                  חיבור אינטרנט: <strong className="font-normal text-on-surface">{formData.requiresNetwork ? 'נדרש' : 'לא נדרש'}</strong>
                  {' '}(נקבע אוטומטית מ-<code dir="ltr">network.enabled</code> ב-<code dir="ltr">manifest.json</code>)
                </span>
              </div>
            </>
          )}
          <FormField id="edit-description" label="תיאור מלא" required>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className={fieldClasses({ kind: 'textarea' })}
              required
              {...fieldA11yProps('edit-description', { required: true })}
            />
          </FormField>
        </EditSection>

        <EditSection id="edit-section-tags" title="תגיות">
          <TagInput
            id="edit-new-tag"
            tags={formData.tags}
            onTagsChange={(tags) => handleChange('tags', tags)}
            suggestions={tagSuggestions}
            placeholder="הוסף תגית"
          />
        </EditSection>

        <EditSection id="edit-section-files" title="קבצים">
          <FileDropZone
            id="edit-plugin-file"
            icon="folder_zip"
            label={<>קובץ תוסף (<bdi dir="ltr">.otzplugin</bdi>)</>}
            accept=".otzplugin"
            onChange={handlePluginFile}
            hint={
              <>
                {plugin.pluginFileName && <p>קובץ נוכחי: <bdi dir="ltr">{plugin.pluginFileName}</bdi></p>}
                {isAdmin && <p>למנהל, החלפת הקובץ אינה משנה אוטומטית את השדות הידניים. ניתן לשמור על אותה גרסה אך לא לשנמך, והמזהה (id) ב-manifest.json חייב להישאר זהה.</p>}
                {!isAdmin && <p>אם מעלים קובץ חדש, הגרסה תזוהה אוטומטית מ-manifest.json ועליה להיות גבוהה מהגרסה הנוכחית ({originalVersion}). המזהה (id) חייב להישאר זהה.</p>}
              </>
            }
          >
            {pluginFile && <SelectedFile>נבחר: {pluginFile.name}</SelectedFile>}
          </FileDropZone>

          <FileDropZone id="edit-image-file" icon="image" label="תמונת תוסף" accept="image/*" onChange={handleImageFile}>
            {imagePreview ? (
              <IconPreview src={imagePreview} alt="תצוגה מקדימה" />
            ) : plugin.imageData && !removeImage ? (
              <div className="flex flex-wrap items-end gap-3">
                <IconPreview src={plugin.image} alt="תמונה נוכחית" />
                <Button type="button" variant="text" size="sm" icon="delete" onClick={() => setRemoveImage(true)}>
                  הסר תמונה
                </Button>
              </div>
            ) : null}
          </FileDropZone>

          <FileDropZone id="edit-screenshots" icon="photo_library" label="צילומי מסך" accept="image/*" multiple onChange={handleScreenshotFiles}>
            {screenshotPreviews.length > 0 ? (
              <ScreenshotPreviews srcs={screenshotPreviews} />
            ) : plugin.screenshots?.length > 0 && !removeScreenshots ? (
              <div className="space-y-2">
                <ScreenshotPreviews srcs={plugin.screenshots} />
                <Button type="button" variant="text" size="sm" icon="delete" onClick={() => setRemoveScreenshots(true)}>
                  הסר את כל צילומי המסך
                </Button>
              </div>
            ) : null}
          </FileDropZone>
        </EditSection>
      </form>
    </Dialog>
  )
}

const EDIT_FORM_ID = 'plugin-edit-form'

/** אזור בחלון העריכה: כותרת h3 (text-title-md) ותוכן במרווח קבוע */
function EditSection({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h3 id={id} className="text-title-md text-on-surface">{title}</h3>
      {children}
    </section>
  )
}

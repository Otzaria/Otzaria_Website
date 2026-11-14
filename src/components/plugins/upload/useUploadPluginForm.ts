'use client'

import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/providers/DialogContext'
import type { DialogReturnFocus } from '@/components/ui/useDialogA11y'
import { MIN_SUPPORTED_APP_VERSION } from '@/lib/pluginStatus'
import { getErrorMessage } from '@/lib/errors'
import { MAX_PLUGIN_BYTES, MAX_IMAGE_BYTES, MAX_SCREENSHOTS, ALLOWED_IMAGE_MIMES } from '@/lib/pluginLimits'
import {
  EMPTY_UPLOAD_FORM,
  buildUploadFormData,
  manifestToFormValues,
  readManifestFields,
  uploadRedirectTarget,
  uploadSuccessMessage,
  validateUploadManifest,
  validateUploadSubmission,
  type UploadFieldKey,
  type UploadFormFields
} from './uploadLogic'

/** id של הפקד לכל שדה — לפוקוס אחרי שגיאה, ול-htmlFor */
export const UPLOAD_FIELD_IDS: Record<UploadFieldKey, string> = {
  pluginFile: 'upload-plugin-file',
  imageFile: 'upload-image-file',
  screenshots: 'upload-screenshots',
  description: 'upload-description',
  reportsConsent: 'upload-reports-consent'
}

export const UPLOAD_REQUIRES_SERVICE_ID = 'upload-requires-service'

// Reads manifest.json from an .otzplugin (ZIP) file using fflate
export async function readPluginManifest(file: File): Promise<Record<string, unknown>> {
  const { unzipSync } = await import('fflate')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const unzipped = unzipSync(bytes, { filter: (info) => info.name === 'manifest.json' })
  const manifestBytes = unzipped['manifest.json']
  if (!manifestBytes) throw new Error('manifest.json not found in plugin file')
  return JSON.parse(new TextDecoder().decode(manifestBytes))
}

/**
 * המצב וההתנהגות של טופס העלאת התוסף — הועברו כמו שהם מ-page.tsx (קריאת ה-manifest,
 * בדיקות הקבצים, השליחה ל-/api/plugins/upload, ההודעות בחלון). מה שנוסף: fieldErrors —
 * אותה הודעה מוצגת גם ליד השדה, ואחרי שגיאת שליחה הפוקוס עובר לשדה.
 */
export function useUploadPluginForm({ serviceEnabled = false }: { serviceEnabled?: boolean } = {}) {
  const router = useRouter()
  const { showAlert, showMessage } = useDialog() as {
    showAlert: (title: string, message: string) => void
    showMessage: (title: string, message: string, confirmText?: string, options?: { returnFocus?: DialogReturnFocus }) => Promise<void>
  }
  const [loading, setLoading] = useState(false)
  const [reportsConsent, setReportsConsentState] = useState(false)
  const [requiresService, setRequiresService] = useState(false)
  const [formData, setFormData] = useState<UploadFormFields>(EMPTY_UPLOAD_FORM)

  const [pluginFile, setPluginFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([])
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<UploadFieldKey, string>>>({})

  const setFieldError = (field: UploadFieldKey, message: string | null) => {
    setFieldErrors(prev => {
      if (!message && !prev[field]) return prev
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]
      return next
    })
  }

  /** ההודעה בחלון (כמו קודם) — וגם ליד השדה */
  const fail = (field: UploadFieldKey, message: string) => {
    showAlert('שגיאה', message)
    setFieldError(field, message)
  }

  const handleChange = <K extends keyof UploadFormFields>(field: K, value: UploadFormFields[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (field === 'description') setFieldError('description', null)
  }

  const setReportsConsent = (value: boolean) => {
    setReportsConsentState(value)
    if (value) setFieldError('reportsConsent', null)
  }

  const setTags = (tags: string[]) => handleChange('tags', tags)

  // עיבוד קובץ תוסף (משותף ל-input ול-drop)
  const processPluginFile = async (file: File, resetInput: () => void) => {
    if (!file.name.toLowerCase().endsWith('.otzplugin')) {
      fail('pluginFile', 'קובץ התוסף חייב להיות בפורמט .otzplugin')
      resetInput()
      return
    }
    if (file.size > MAX_PLUGIN_BYTES) {
      fail('pluginFile', `קובץ התוסף חורג מהמגבלה של ${MAX_PLUGIN_BYTES / 1024 / 1024}MB`)
      resetInput()
      return
    }

    let manifest: Record<string, unknown>
    try {
      manifest = await readPluginManifest(file)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      fail('pluginFile', `לא ניתן לקרוא את manifest.json מקובץ התוסף: ${msg}`)
      resetInput()
      return
    }

    const fields = readManifestFields(manifest)
    const manifestError = validateUploadManifest(fields, MIN_SUPPORTED_APP_VERSION)
    if (manifestError) {
      fail('pluginFile', manifestError)
      resetInput()
      return
    }

    setFormData(prev => ({ ...prev, ...manifestToFormValues(fields) }))
    setPluginFile(file)
    setFieldError('pluginFile', null)
  }

  const handlePluginFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    await processPluginFile(file, () => { input.value = '' })
  }

  const dropPluginFile = (files: FileList) => {
    if (files.length > 1) {
      fail('pluginFile', 'ניתן לגרור רק קובץ תוסף אחד')
      return
    }
    const file = files[0]
    if (file) void processPluginFile(file, () => {})
  }

  // עיבוד תמונה (משותף ל-input ול-drop)
  const processImageFile = (file: File) => {
    if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
      fail('imageFile', 'תמונה חייבת להיות בפורמט PNG, JPEG, WEBP או GIF')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      fail('imageFile', `התמונה חורגת מהמגבלה של ${MAX_IMAGE_BYTES / 1024 / 1024}MB`)
      return
    }
    setImageFile(file)
    setFieldError('imageFile', null)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleImageFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processImageFile(file)
  }

  const dropImageFile = (files: FileList) => {
    if (files.length > 1) {
      fail('imageFile', 'ניתן לגרור תמונה אחת בלבד')
      return
    }
    const file = files[0]
    if (file) processImageFile(file)
  }

  // עיבוד צילומי מסך (משותף ל-input ול-drop)
  const processScreenshotFiles = (files: File[]) => {
    if (files.length > MAX_SCREENSHOTS) {
      fail('screenshots', `מותר עד ${MAX_SCREENSHOTS} צילומי מסך`)
      return
    }
    for (const f of files) {
      if (!ALLOWED_IMAGE_MIMES.includes(f.type)) {
        fail('screenshots', 'צילומי מסך חייבים להיות בפורמט PNG, JPEG, WEBP או GIF')
        return
      }
      if (f.size > MAX_IMAGE_BYTES) {
        fail('screenshots', `כל צילום מסך מוגבל ל-${MAX_IMAGE_BYTES / 1024 / 1024}MB`)
        return
      }
    }
    setScreenshotFiles(files)
    if (files.length > 0) setFieldError('screenshots', null)

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

  const handleScreenshotFiles = (e: ChangeEvent<HTMLInputElement>) => {
    processScreenshotFiles(Array.from(e.target.files || []))
  }

  const dropScreenshotFiles = (files: FileList) => {
    processScreenshotFiles(Array.from(files))
  }

  // שליחת הטופס
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    let focusField: UploadFieldKey | null = null

    try {
      const invalid = validateUploadSubmission({
        formData,
        hasPluginFile: Boolean(pluginFile),
        screenshotCount: screenshotFiles.length,
        reportsConsent
      })
      if (invalid) {
        if (invalid.field) {
          setFieldError(invalid.field, invalid.message)
          focusField = invalid.field
        }
        throw new Error(invalid.message)
      }

      const data = buildUploadFormData({
        formData,
        pluginFile: pluginFile as File,
        imageFile,
        screenshotFiles,
        requiresService: serviceEnabled && requiresService
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

      await showAlert('הצלחה', uploadSuccessMessage(result))
      router.push(uploadRedirectTarget(result))
    } catch (error: unknown) {
      // showMessage: דיאלוג מודאלי חוסם, נשאר על המסך עד שהמשתמש לוחץ אישור,
      // כך שהודעות שגיאה רב-שורתיות (למשל פירוט ולידציה מול ה-SDK) ייקראו במלואן.
      // שגיאת ולידציה — בסגירת ההודעה הפוקוס עובר לשדה השגוי (ולא חוזר לכפתור השליחה). דרך
      // returnFocus ולא focus() אחרי ה-await: החלון מוסר מה-DOM רק אחרי אנימציית היציאה, ואז
      // useDialogA11y מחזיר את הפוקוס — כך שפוקוס שהוזז קודם לכן היה נדרס.
      const field = focusField
      await showMessage('שגיאה בהעלאת התוסף', getErrorMessage(error, 'שגיאה בהעלאת התוסף'), undefined, {
        returnFocus: field ? () => document.getElementById(UPLOAD_FIELD_IDS[field]) : undefined
      })
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    formData,
    handleChange,
    reportsConsent,
    setReportsConsent,
    serviceEnabled,
    requiresService,
    setRequiresService,
    setTags,
    pluginFile,
    handlePluginFile,
    dropPluginFile,
    imagePreview,
    handleImageFile,
    dropImageFile,
    screenshotFiles,
    screenshotPreviews,
    handleScreenshotFiles,
    dropScreenshotFiles,
    fieldErrors,
    handleSubmit
  }
}

export type UploadPluginForm = ReturnType<typeof useUploadPluginForm>

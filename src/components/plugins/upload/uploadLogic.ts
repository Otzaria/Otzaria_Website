import { compareVersions } from '@/lib/semverCompare'
import { normalizeTagList } from '@/lib/pluginTags'

/**
 * הלוגיקה הטהורה של טופס העלאת התוסף (/plugins/upload) — חולצה מ-page.tsx כמו שהיא:
 * אותו סדר בדיקות, אותן הודעות שגיאה, אותם שמות שדות ב-FormData (השרת וה-API לא השתנו).
 * המיפוי לשדה (field) חדש — כדי להציג את ההודעה גם ליד השדה, בנוסף לחלון ההודעה הקיים.
 */

export type PluginStatusValue = 'stable' | 'beta' | 'experimental'

export type UploadFormFields = {
  name: string
  shortDescription: string
  description: string
  version: string
  status: PluginStatusValue
  author: string
  compatibleWith: string
  tags: string[]
  homepage: string
}

export const EMPTY_UPLOAD_FORM: UploadFormFields = {
  name: '',
  shortDescription: '',
  description: '',
  version: '',
  status: 'stable',
  author: '',
  compatibleWith: '',
  tags: [],
  homepage: ''
}

/** השדות בטופס שאליהם אפשר לשייך הודעת שגיאה */
export type UploadFieldKey = 'pluginFile' | 'imageFile' | 'screenshots' | 'description' | 'reportsConsent'

export type FieldErrorResult = { field: UploadFieldKey | null; message: string }

const str = (value: unknown) => (typeof value === 'string' ? value : '').trim()

/** הערכים שהטופס לוקח מ-manifest.json (מחרוזות מקוצצות; חסר → '') */
export function readManifestFields(manifest: Record<string, unknown>) {
  return {
    manifestId: str(manifest.id),
    version: str(manifest.version),
    name: str(manifest.name),
    author: str(manifest.author),
    shortDescription: str(manifest.description),
    stability: str(manifest.stability),
    minAppVersion: str(manifest.minAppVersion),
    homepage: str(manifest.homepage)
  }
}

export type ManifestFields = ReturnType<typeof readManifestFields>

/** בדיקת manifest.json של קובץ חדש — הודעת השגיאה הראשונה, או null כשהכול תקין */
export function validateUploadManifest(fields: ManifestFields, minSupportedAppVersion: string): string | null {
  if (!fields.manifestId) return 'חסר שדה id ב-manifest.json (מזהה ייחודי בסגנון com.company.plugin-name)'
  if (!fields.version) return 'חסר שדה גרסה ב-manifest.json'
  if (!fields.name) return 'חסר שדה name ב-manifest.json'
  if (!fields.author) return 'חסר שדה author ב-manifest.json'
  if (!fields.shortDescription) return 'חסר שדה description ב-manifest.json'
  if (!fields.stability || !['stable', 'beta', 'experimental'].includes(fields.stability)) {
    return 'חסר שדה stability תקין ב-manifest.json (ערכים מותרים: stable, beta, experimental)'
  }
  if (!fields.minAppVersion) return 'חסר שדה minAppVersion ב-manifest.json'
  if (compareVersions(fields.minAppVersion, minSupportedAppVersion) < 0) {
    return `גרסת המינימום (${fields.minAppVersion}) לא יכולה להיות פחות מ-${minSupportedAppVersion}`
  }
  return null
}

/** הערכים שהטופס ממלא מה-manifest (אחרי שעבר בדיקה) */
export function manifestToFormValues(fields: ManifestFields): Partial<UploadFormFields> {
  return {
    version: fields.version,
    name: fields.name,
    author: fields.author,
    shortDescription: fields.shortDescription,
    status: fields.stability as PluginStatusValue,
    compatibleWith: fields.minAppVersion,
    homepage: fields.homepage
  }
}

/** בדיקות לפני שליחה — בדיוק לפי הסדר המקורי. null = אפשר לשלוח */
export function validateUploadSubmission({ formData, hasPluginFile, screenshotCount, reportsConsent }: {
  formData: UploadFormFields
  hasPluginFile: boolean
  screenshotCount: number
  reportsConsent: boolean
}): FieldErrorResult | null {
  if (!hasPluginFile) return { field: 'pluginFile', message: 'חובה לצרף קובץ תוסף' }
  if (!formData.description || !formData.compatibleWith) {
    return { field: formData.description ? 'pluginFile' : 'description', message: 'נא למלא את כל השדות החובה' }
  }
  if (!formData.version || !formData.name || !formData.author || !formData.shortDescription) {
    return { field: 'pluginFile', message: 'נא לבחור קובץ תוסף תחילה - שם, מפתח, תיאור קצר וגרסה יזוהו אוטומטית' }
  }
  if (screenshotCount < 1) {
    return { field: 'screenshots', message: 'חובה לצרף לפחות צילום מסך אחד. ללא צילום מסך התוסף יידחה' }
  }
  if (!['stable', 'beta', 'experimental'].includes(formData.status)) {
    return { field: null, message: 'סטטוס לא תקין' }
  }
  if (!reportsConsent) {
    return { field: 'reportsConsent', message: 'יש לאשר קבלת דיווחים ממשתמשים למייל שלך' }
  }
  return null
}

/** גוף הבקשה ל-POST /api/plugins/upload — שמות השדות כפי שהשרת מצפה להם */
export function buildUploadFormData({ formData, pluginFile, imageFile, screenshotFiles, requiresService = false }: {
  formData: UploadFormFields
  pluginFile: File
  imageFile: File | null
  screenshotFiles: File[]
  /** "דורש שירות חיצוני" — נשלח רק כשסומן (השרת מתעלם ממנו כשהתכונה כבויה) */
  requiresService?: boolean
}): FormData {
  const data = new FormData()
  data.append('name', formData.name)
  data.append('shortDescription', formData.shortDescription)
  data.append('description', formData.description)
  data.append('version', formData.version)
  data.append('status', formData.status)
  data.append('author', formData.author)
  data.append('compatibleWith', formData.compatibleWith)
  // אותו נרמול כמו בשרת (pluginTags.js) — פיצול פסיקים, גרשיים, כפילויות
  data.append('tags', JSON.stringify(normalizeTagList(formData.tags)))
  data.append('homepage', formData.homepage)
  data.append('reportsConsent', 'true')
  if (requiresService) data.append('requiresService', 'true')

  data.append('pluginFile', pluginFile)
  if (imageFile) {
    data.append('imageFile', imageFile)
  }
  screenshotFiles.forEach(file => {
    data.append('screenshots', file)
  })
  return data
}

export type UploadResult = {
  designCompliant?: boolean
  serviceSubmissionUrl?: string
  plugin?: { id?: string; hasService?: boolean }
} | null | undefined

/** האם השרת קלט את התוסף כתוסף שירות (ולא התעלם מהסימון כי התכונה כבויה) */
export function isServiceUpload(result: UploadResult): boolean {
  return Boolean(result?.serviceSubmissionUrl || result?.plugin?.hasService)
}

/** לאן עוברים אחרי העלאה: תוסף שירות — לדף הגשת השירות; אחרת — לחנות */
export function uploadRedirectTarget(result: UploadResult): string {
  if (result?.serviceSubmissionUrl?.startsWith('/')) return result.serviceSubmissionUrl
  if (result?.plugin?.hasService && result.plugin.id) return `/plugins/${encodeURIComponent(result.plugin.id)}/service`
  return '/plugins'
}

/** הודעת ההצלחה אחרי העלאה (כולל ההערה על התגית "מראה תואם לאוצריא") */
export function uploadSuccessMessage(result: UploadResult): string {
  if (isServiceUpload(result)) {
    return 'פרטי התוסף נקלטו. כעת יש להשלים את הגשת השירות: מקור, קובץ התוסף, מתקינים ופרטי זיהוי והסרה. התוסף לא יפורסם לפני שההגשה תיבחר ותעבור את הבדיקות.'
  }
  const designNote = result?.designCompliant === false
    ? '\n(התגית "מראה תואם לאוצריא" לא נוספה — העיצוב אינו תואם להנחיות.)'
    : ''
  return `התוסף הועלה בהצלחה ונשלח לאישור מנהל. לאחר האישור הוא יופיע בחנות התוספים.${designNote}`
}

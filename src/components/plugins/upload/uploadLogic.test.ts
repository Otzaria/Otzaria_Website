import { describe, it, expect } from 'vitest'
import {
  EMPTY_UPLOAD_FORM,
  buildUploadFormData,
  manifestToFormValues,
  readManifestFields,
  isServiceUpload,
  uploadRedirectTarget,
  uploadSuccessMessage,
  validateUploadManifest,
  validateUploadSubmission,
  type UploadFormFields
} from './uploadLogic'

const VALID_MANIFEST = {
  id: 'com.example.dict',
  version: ' 1.2.0 ',
  name: 'מילון',
  author: 'ישראל',
  description: 'תיאור קצר',
  stability: 'beta',
  minAppVersion: '9.0.0',
  homepage: 'https://example.com'
}

const FILLED: UploadFormFields = {
  ...EMPTY_UPLOAD_FORM,
  name: 'מילון',
  shortDescription: 'קצר',
  description: 'מלא',
  version: '1.0.0',
  author: 'א',
  compatibleWith: '0.9.0'
}

describe('readManifestFields / validateUploadManifest', () => {
  it('מקצץ מחרוזות ומתעלם מערכים שאינם מחרוזת', () => {
    const fields = readManifestFields({ ...VALID_MANIFEST, homepage: 42 })
    expect(fields.version).toBe('1.2.0')
    expect(fields.homepage).toBe('')
  })

  it('manifest תקין — null; וממופה לשדות הטופס', () => {
    const fields = readManifestFields(VALID_MANIFEST)
    expect(validateUploadManifest(fields, '0.9.0')).toBeNull()
    expect(manifestToFormValues(fields)).toEqual({
      version: '1.2.0', name: 'מילון', author: 'ישראל', shortDescription: 'תיאור קצר',
      status: 'beta', compatibleWith: '9.0.0', homepage: 'https://example.com'
    })
  })

  it('סדר הבדיקות וההודעות — כמו בטופס המקורי', () => {
    const check = (patch: Record<string, unknown>) => validateUploadManifest(readManifestFields({ ...VALID_MANIFEST, ...patch }), '0.9.0')
    expect(check({ id: '' })).toBe('חסר שדה id ב-manifest.json (מזהה ייחודי בסגנון com.company.plugin-name)')
    expect(check({ id: '', version: '' })).toMatch(/^חסר שדה id/)
    expect(check({ version: '' })).toBe('חסר שדה גרסה ב-manifest.json')
    expect(check({ name: '' })).toBe('חסר שדה name ב-manifest.json')
    expect(check({ author: '' })).toBe('חסר שדה author ב-manifest.json')
    expect(check({ description: '' })).toBe('חסר שדה description ב-manifest.json')
    expect(check({ stability: 'alpha' })).toBe('חסר שדה stability תקין ב-manifest.json (ערכים מותרים: stable, beta, experimental)')
    expect(check({ minAppVersion: '' })).toBe('חסר שדה minAppVersion ב-manifest.json')
    expect(check({ minAppVersion: '0.1.0' })).toBe('גרסת המינימום (0.1.0) לא יכולה להיות פחות מ-0.9.0')
  })
})

describe('validateUploadSubmission', () => {
  const base = { formData: FILLED, hasPluginFile: true, screenshotCount: 1, reportsConsent: true }

  it('הכול תקין — null', () => {
    expect(validateUploadSubmission(base)).toBeNull()
  })

  it('כל שגיאה משויכת לשדה שלה, באותו סדר ובאותו נוסח', () => {
    expect(validateUploadSubmission({ ...base, hasPluginFile: false })).toEqual({ field: 'pluginFile', message: 'חובה לצרף קובץ תוסף' })
    expect(validateUploadSubmission({ ...base, formData: { ...FILLED, description: '' } }))
      .toEqual({ field: 'description', message: 'נא למלא את כל השדות החובה' })
    expect(validateUploadSubmission({ ...base, formData: { ...FILLED, compatibleWith: '' } }))
      .toEqual({ field: 'pluginFile', message: 'נא למלא את כל השדות החובה' })
    expect(validateUploadSubmission({ ...base, formData: { ...FILLED, name: '' } })?.message)
      .toBe('נא לבחור קובץ תוסף תחילה - שם, מפתח, תיאור קצר וגרסה יזוהו אוטומטית')
    expect(validateUploadSubmission({ ...base, screenshotCount: 0 }))
      .toEqual({ field: 'screenshots', message: 'חובה לצרף לפחות צילום מסך אחד. ללא צילום מסך התוסף יידחה' })
    expect(validateUploadSubmission({ ...base, formData: { ...FILLED, status: 'x' as never } }))
      .toEqual({ field: null, message: 'סטטוס לא תקין' })
    expect(validateUploadSubmission({ ...base, reportsConsent: false }))
      .toEqual({ field: 'reportsConsent', message: 'יש לאשר קבלת דיווחים ממשתמשים למייל שלך' })
  })
})

describe('buildUploadFormData', () => {
  it('שמות השדות שהשרת מצפה להם (/api/plugins/upload) — ללא שינוי', () => {
    const pluginFile = new File(['x'], 'a.otzplugin')
    const shot = new File(['y'], 's.png', { type: 'image/png' })
    const data = buildUploadFormData({ formData: { ...FILLED, tags: ['א', 'ב'] }, pluginFile, imageFile: null, screenshotFiles: [shot, shot] })
    expect([...new Set([...data.keys()])]).toEqual([
      'name', 'shortDescription', 'description', 'version', 'status', 'author', 'compatibleWith',
      'tags', 'homepage', 'reportsConsent', 'pluginFile', 'screenshots'
    ])
    expect(data.get('tags')).toBe('["א","ב"]')
    expect(data.get('reportsConsent')).toBe('true')
    expect(data.getAll('screenshots')).toHaveLength(2)
    expect(data.has('imageFile')).toBe(false)
  })

  it('התגיות נשלחות מנורמלות: פיצול פסיקים, גרשיים, בלי כפילויות', () => {
    const data = buildUploadFormData({
      formData: { ...FILLED, tags: ['כלי עזר, גימטריא', 'תנ״ך', 'תנ"ך', ' כלי  עזר '] },
      pluginFile: new File(['x'], 'a.otzplugin'),
      imageFile: null,
      screenshotFiles: []
    })
    expect(JSON.parse(data.get('tags') as string)).toEqual(['כלי עזר', 'גימטריא', 'תנ"ך'])
  })

  it('imageFile נשלח רק כשנבחרה תמונה', () => {
    const img = new File(['z'], 'i.png', { type: 'image/png' })
    const data = buildUploadFormData({ formData: FILLED, pluginFile: new File(['x'], 'a.otzplugin'), imageFile: img, screenshotFiles: [] })
    expect(data.get('imageFile')).toBeInstanceOf(File)
  })
})

describe('uploadSuccessMessage', () => {
  it('מוסיף את ההערה על התגית רק כש-designCompliant === false', () => {
    expect(uploadSuccessMessage({})).toBe('התוסף הועלה בהצלחה ונשלח לאישור מנהל. לאחר האישור הוא יופיע בחנות התוספים.')
    expect(uploadSuccessMessage({ designCompliant: false })).toContain('(התגית "מראה תואם לאוצריא" לא נוספה')
  })
})

describe('תוסף שירות בהעלאה', () => {
  it('requiresService נשלח רק כשסומן', () => {
    const args = { formData: FILLED, pluginFile: new File(['x'], 'a.otzplugin'), imageFile: null, screenshotFiles: [] }
    expect(buildUploadFormData(args).has('requiresService')).toBe(false)
    expect(buildUploadFormData({ ...args, requiresService: false }).has('requiresService')).toBe(false)
    expect(buildUploadFormData({ ...args, requiresService: true }).get('requiresService')).toBe('true')
  })

  it('uploadRedirectTarget — לדף הגשת השירות רק כשהשרת קלט תוסף שירות', () => {
    expect(uploadRedirectTarget({ serviceSubmissionUrl: '/plugins/abc/service', plugin: { id: 'abc', hasService: true } })).toBe('/plugins/abc/service')
    expect(uploadRedirectTarget({ plugin: { id: 'abc', hasService: true } })).toBe('/plugins/abc/service')
    expect(uploadRedirectTarget({ plugin: { id: 'abc', hasService: false } })).toBe('/plugins')
    expect(uploadRedirectTarget({ serviceSubmissionUrl: 'https://evil.example/x' })).toBe('/plugins')
    expect(uploadRedirectTarget(null)).toBe('/plugins')
  })

  it('הודעת הצלחה לתוסף שירות מפנה להשלמת ההגשה', () => {
    expect(isServiceUpload({ plugin: { hasService: true } })).toBe(true)
    expect(isServiceUpload({})).toBe(false)
    expect(uploadSuccessMessage({ plugin: { hasService: true } })).toMatch(/להשלים את הגשת השירות/)
  })
})

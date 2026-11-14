import { describe, it, expect } from 'vitest'
import {
  activeReview,
  apiErrorMessages,
  buildDraftRequest,
  buildUploadQueue,
  DEFAULT_LIMITS,
  emptyInstallerRow,
  emptySourceRow,
  initialSubmissionForm,
  isValidBundledPath,
  isValidRepository,
  parseReleaseUrl,
  statusMeta,
  STATUS_META,
  REVIEW_STATUSES,
  validateSubmissionForm,
  type ManageCurrent,
  type ManageReview,
  type SubmissionForm
} from './serviceSubmissionLogic'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

function file(name: string, size = 10): File {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

function validServiceForm(): SubmissionForm {
  const form = initialSubmissionForm(null)
  return {
    ...form,
    pluginVersion: '1.0.0',
    serviceVersion: '1.0.0',
    rangeMin: '1.0.0',
    rangeMax: '1.9.99',
    sources: [{ ...emptySourceRow(), repository: 'Owner/Repo', commit: COMMIT.toUpperCase() }],
    installers: [{
      ...emptyInstallerRow(),
      file: file('setup.exe', 1234),
      os: 'windows',
      arch: 'x64',
      minOs: 'Windows 10',
      port: '18090',
      releaseUrl: 'https://github.com/owner/repo/releases/download/v1.0.0/setup.exe'
    }],
    uninstall: 'הסרה דרך אפליקציות מותקנות',
    changeNotes: 'הגשה ראשונה'
  }
}

const ctx = (overrides: Partial<Parameters<typeof validateSubmissionForm>[1]> = {}) => ({
  pluginUid: 'org.example.svc',
  current: null,
  limits: DEFAULT_LIMITS,
  pluginFile: file('p.otzplugin', 100),
  manifest: { id: 'org.example.svc', version: '1.0.0' },
  ...overrides
})

describe('validateSubmissionForm — הגשת שירות', () => {
  it('הגשה תקינה — בלי שגיאות (commit באותיות גדולות מנורמל)', () => {
    expect(validateSubmissionForm(validServiceForm(), ctx())).toEqual([])
  })

  it('תוסף חסר / מזהה אחר / גרסה שונה מהקובץ', () => {
    expect(validateSubmissionForm(validServiceForm(), ctx({ pluginFile: null }))).toContain('יש לבחור את קובץ התוסף (.otzplugin)')
    const errors = validateSubmissionForm(validServiceForm(), ctx({ manifest: { id: 'org.other', version: '2.0.0' } }))
    expect(errors.some((e) => e.includes('שונה ממזהה התוסף'))).toBe(true)
    expect(errors).toContain('גרסת התוסף שבטופס שונה מהגרסה שבקובץ התוסף')
  })

  it('טווח: חובה מקסימום או "ללא תקרה"; מקסימום נמוך מהמינימום', () => {
    const noMax = { ...validServiceForm(), rangeMax: '' }
    expect(validateSubmissionForm(noMax, ctx())).toContain('יש להזין גרסת שירות מרבית בפורמט X.Y.Z, או לסמן "ללא תקרה"')
    expect(validateSubmissionForm({ ...noMax, noCeiling: true }, ctx())).toEqual([])
    const inverted = { ...validServiceForm(), rangeMin: '2.0.0', rangeMax: '1.0.0', serviceVersion: '2.0.0', pluginVersion: '1.0.0' }
    expect(validateSubmissionForm(inverted, ctx())).toContain('גרסת השירות המרבית בטווח חייבת להיות שווה למינימלית או גבוהה ממנה')
  })

  it('גרסת השירות חייבת להיות בטווח ומעל הנוכחית', () => {
    const outOfRange = { ...validServiceForm(), serviceVersion: '3.0.0' }
    expect(validateSubmissionForm(outOfRange, ctx())).toContain('גרסת השירות שבהגשה חייבת להיות בתוך טווח התאימות של התוסף')
    const current: ManageCurrent = { pluginVersion: '1.0.0', serviceVersion: '1.0.0', serviceRange: { min: '1.0.0', max: null }, platforms: [] }
    const errors = validateSubmissionForm(validServiceForm(), ctx({ current }))
    expect(errors).toContain('גרסת התוסף חייבת להיות גבוהה מהגרסה הנוכחית (1.0.0)')
    expect(errors).toContain('גרסת השירות חייבת להיות גבוהה מהגרסה הנוכחית (1.0.0)')
  })

  it('מתקינים: סיומת למערכת, צירוף כפול, פורט אחיד למערכת, Release ממאגר שהוגש, נתיב יחסי', () => {
    const form = validServiceForm()
    const base = form.installers[0]
    form.installers = [
      base,
      { ...emptyInstallerRow(), file: file('setup.dmg'), os: 'windows', arch: 'x64', minOs: '10', port: '18091', bundledPluginPath: '../p.otzplugin', releaseUrl: 'https://github.com/other/repo/releases/download/v1/setup.dmg' }
    ]
    const errors = validateSubmissionForm(form, ctx())
    expect(errors).toContain('מתקין 2: כבר יש מתקין ל-Windows x64')
    expect(errors).toContain('מתקין 2: סוג הקובץ אינו מותר ל-Windows')
    expect(errors).toContain('מתקין 2: לכל המתקינים של Windows חייב להיות אותו פורט זיהוי')
    expect(errors).toContain('מתקין 2: קישור ה-Release חייב להיות מאחד ממאגרי המקור שבהגשה')
    expect(errors.some((e) => e.startsWith('מתקין 2: נתיב התוסף'))).toBe(true)
  })

  it('פורט מחוץ לתחום; הוראות הסרה חובה', () => {
    const form = validServiceForm()
    form.installers[0] = { ...form.installers[0], port: '80' }
    form.uninstall = '  '
    const errors = validateSubmissionForm(form, ctx())
    expect(errors).toContain('מתקין 1: פורט הזיהוי חייב להיות מספר בין 1024 ל-65535')
    expect(errors).toContain('יש לכתוב הוראות הסרה של השירות')
  })

  it('מקורות: פורמט owner/repo ו-commit מלא', () => {
    const form = { ...validServiceForm(), sources: [{ ...emptySourceRow(), repository: 'bad', commit: 'abc' }] }
    const errors = validateSubmissionForm(form, ctx())
    expect(errors).toContain('מקור 1: יש להזין מאגר GitHub בפורמט owner/repository')
    expect(errors).toContain('מקור 1: commit חייב להיות מזהה מלא בן 40 תווים הקסדצימליים')
  })
})

describe('validateSubmissionForm — עדכון תוסף בלבד', () => {
  const current: ManageCurrent = { pluginVersion: '1.0.0', serviceVersion: '1.2.0', serviceRange: { min: '1.0.0', max: null }, platforms: [] }

  it('דורש שירות מאושר בטווח; לא בודק מתקינים והסרה', () => {
    const form: SubmissionForm = { ...validServiceForm(), kind: 'plugin', pluginVersion: '1.1.0', installers: [], uninstall: '' }
    expect(validateSubmissionForm(form, ctx({ current, manifest: { id: 'org.example.svc', version: '1.1.0' } }))).toEqual([])
    expect(validateSubmissionForm(form, ctx({ current: null, manifest: { id: 'org.example.svc', version: '1.1.0' } })))
      .toContain('עדכון תוסף בלבד אפשרי רק אחרי שאושר שירות')
    const narrow = { ...form, rangeMin: '1.3.0', rangeMax: '1.4.0' }
    expect(validateSubmissionForm(narrow, ctx({ current, manifest: { id: 'org.example.svc', version: '1.1.0' } })))
      .toContain('גרסת השירות המאושרת (1.2.0) אינה בטווח שהוזן')
  })
})

describe('בניית הבקשות', () => {
  it('buildDraftRequest — המבנה של מדריך המפתח', () => {
    const form = validServiceForm()
    const body = buildDraftRequest(form, { size: 100 })
    expect(body).toEqual({
      kind: 'service',
      pluginVersion: '1.0.0',
      pluginSize: 100,
      serviceVersion: '1.0.0',
      serviceRange: { min: '1.0.0', max: '1.9.99' },
      sources: [{ repository: 'Owner/Repo', commit: COMMIT }],
      changeNotes: 'הגשה ראשונה',
      uninstall: 'הסרה דרך אפליקציות מותקנות',
      virusTotalConsent: false,
      assets: [{
        name: 'setup.exe', size: 1234, os: 'windows', arch: 'x64', minOs: 'Windows 10', port: 18090,
        bundledPluginPath: 'plugin.otzplugin', releaseUrl: 'https://github.com/owner/repo/releases/download/v1.0.0/setup.exe'
      }]
    })
  })

  it('buildDraftRequest — עדכון תוסף בלבד: בלי serviceVersion / assets / uninstall; ללא תקרה → max null', () => {
    const body = buildDraftRequest({ ...validServiceForm(), kind: 'plugin', noCeiling: true }, { size: 5 })
    expect(body).not.toHaveProperty('serviceVersion')
    expect(body).not.toHaveProperty('assets')
    expect(body).not.toHaveProperty('uninstall')
    expect(body.serviceRange).toEqual({ min: '1.0.0', max: null })
  })

  it('buildUploadQueue — תוסף ואחריו המתקינים לפי הסדר; כתובת חסרה — שגיאה', () => {
    const form = validServiceForm()
    const pluginFile = file('p.otzplugin')
    const queue = buildUploadQueue({ plugin: '/u/plugin', native0: '/u/native0' }, pluginFile, form)
    expect(queue.map((t) => [t.key, t.url])).toEqual([['plugin', '/u/plugin'], ['native0', '/u/native0']])
    expect(() => buildUploadQueue({ plugin: '/u/plugin' }, pluginFile, form)).toThrow(/מתקין 1/)
    expect(buildUploadQueue({ plugin: '/u/plugin' }, pluginFile, { ...form, kind: 'plugin' })).toHaveLength(1)
  })

  it('apiErrorMessages — errors[] קודם, אחר כך error', () => {
    expect(apiErrorMessages({ error: 'x', errors: ['a', 'b'] }, 'f')).toEqual(['a', 'b'])
    expect(apiErrorMessages({ error: 'שגיאה' }, 'f')).toEqual(['שגיאה'])
    expect(apiErrorMessages(null, 'f')).toEqual(['f'])
    expect(apiErrorMessages({ error: 'csrf_rejected' }, 'f')).toEqual(['f'])
  })
})

describe('עזרים', () => {
  it('parseReleaseUrl — רק קישור הורדה של Release ב-github.com', () => {
    expect(parseReleaseUrl('https://github.com/o/r/releases/download/v1.0.0/setup.exe'))
      .toEqual({ owner: 'o', repo: 'r', tag: 'v1.0.0', name: 'setup.exe' })
    expect(parseReleaseUrl('http://github.com/o/r/releases/download/v1/x.exe')).toBeNull()
    expect(parseReleaseUrl('https://evil.com/o/r/releases/download/v1/x.exe')).toBeNull()
    expect(parseReleaseUrl('https://github.com/o/r/releases/tag/v1')).toBeNull()
    expect(parseReleaseUrl('https://github.com/o/r/releases/download/v1/x.exe?a=1')).toBeNull()
    expect(parseReleaseUrl('not a url')).toBeNull()
  })

  it('isValidRepository / isValidBundledPath', () => {
    expect(isValidRepository('owner/repo.name')).toBe(true)
    expect(isValidRepository('owner/..')).toBe(false)
    expect(isValidRepository('-owner/repo')).toBe(false)
    expect(isValidBundledPath('payload/plugin.otzplugin')).toBe(true)
    expect(isValidBundledPath('/abs/plugin.otzplugin')).toBe(false)
    expect(isValidBundledPath('a\\plugin.otzplugin')).toBe(false)
    expect(isValidBundledPath('plugin.zip')).toBe(false)
  })

  it('תווית ומראה לכל מצב, ומצב לא מוכר — בלי קריסה', () => {
    for (const status of REVIEW_STATUSES) expect(STATUS_META[status].label).toBeTruthy()
    expect(statusMeta('weird')).toEqual({ label: 'weird', tone: 'neutral', icon: 'help' })
  })

  it('activeReview — ההגשה שאינה סופית', () => {
    const r = (id: string, status: string) => ({ id, status }) as ManageReview
    expect(activeReview([r('a', 'rejected'), r('b', 'pending_admin')])?.id).toBe('b')
    expect(activeReview([r('a', 'approved')])).toBeNull()
  })
})

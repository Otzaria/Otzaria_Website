import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  session: vi.fn(), manifest: vi.fn(), validate: vi.fn(), create: vi.fn(), mail: vi.fn(), enabled: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: m.session }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Plugin', () => ({
  default: { create: m.create, findOne: () => ({ select: () => ({ lean: async () => null }) }) },
}))
vi.mock('@/lib/pluginManifest', async () => ({ readManifestFromPlugin: m.manifest, ...(await import('@/lib/semverCompare.js')) }))
vi.mock('@/lib/pluginValidation', () => ({ validatePluginArchive: m.validate, OTZARIA_DESIGN_TAG: 'מראה תואם לאוצריא' }))
vi.mock('@/lib/emailService', () => ({ sendPluginUploadNotification: m.mail }))
vi.mock('@/lib/systemMessages', () => ({ sendPluginReportNoticeIfNeeded: vi.fn() }))
vi.mock('@/lib/servicePlugins/config', () => ({ getServicePluginConfig: () => ({ enabled: m.enabled() }) }))
vi.mock('@/lib/pluginStorage', () => ({
  MAX_PLUGIN_BYTES: 50 * 1024 * 1024, MAX_IMAGE_BYTES: 5 * 1024 * 1024, MAX_SCREENSHOT_BYTES: 5 * 1024 * 1024, MAX_SCREENSHOTS: 10,
  PLUGIN_FILE_BASENAME: 'plugin', IMAGE_BASENAME: 'image', ensurePluginDir: vi.fn(async () => 'dir'),
  saveFileFromFormData: vi.fn(), deletePluginDir: vi.fn(), isAllowedImage: vi.fn(() => true), imageExtFromMime: vi.fn(() => '.png'),
  saveOptimizedImage: vi.fn(), pluginFileSha256: () => 'a'.repeat(64),
}))

import { POST } from './route'

const ID = '0123456789abcdef01234567'
function request(extra: Record<string, string> = {}) {
  const data = new FormData()
  for (const [k, v] of Object.entries({ description: 'תיאור ארוך', reportsConsent: 'true', tags: '[]', ...extra })) data.set(k, v)
  data.set('pluginFile', new File([new Uint8Array(8)], 'test.otzplugin'))
  data.set('screenshots', new File([new Uint8Array(4)], 's.png', { type: 'image/png' }))
  return { formData: async () => data } as Request
}

beforeEach(() => {
  vi.clearAllMocks()
  m.enabled.mockReturnValue(true)
  m.session.mockResolvedValue({ user: { id: 'owner', role: 'user', name: 'מפתח', email: 'dev@example.com' } })
  m.manifest.mockResolvedValue({ id: 'org.svc', name: 'שירות', version: '1.0.0', author: 'מפתח', description: 'תיאור', minAppVersion: '0.9.97', stability: 'stable' })
  m.validate.mockResolvedValue({ errors: [], warnings: [], advisories: [], design: { compliant: false, violations: [] } })
  m.create.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc, _id: { toString: () => ID }, save: vi.fn() }))
})

describe('POST /api/plugins/upload requiresService', () => {
  it('flag on + requiresService=true creates a service plugin and links the service page', async () => {
    const res = await POST(request({ requiresService: 'true' }))
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ hasService: true, isApproved: false }))
    const body = await res.json()
    expect(body.plugin).toMatchObject({ name: 'שירות', hasService: true })
    expect(body.serviceSubmissionUrl).toBe(`/plugins/${ID}/service`)
    expect(m.mail).toHaveBeenCalled()
  })

  it('flag off ignores requiresService and keeps the old response', async () => {
    m.enabled.mockReturnValue(false)
    const res = await POST(request({ requiresService: 'true' }))
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ hasService: false }))
    const body = await res.json()
    expect(Object.keys(body.plugin)).toEqual(['id', 'name', 'slug'])
    expect(body).not.toHaveProperty('serviceSubmissionUrl')
  })

  it('only the exact value "true" opts in', async () => {
    for (const value of ['', 'on', '1', 'false']) {
      m.create.mockClear()
      await POST(request(value ? { requiresService: value } : {}))
      expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ hasService: false }))
    }
  })
})

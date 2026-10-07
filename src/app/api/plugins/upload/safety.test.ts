import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  session: vi.fn(), manifest: vi.fn(), validate: vi.fn(), find: vi.fn(), create: vi.fn(),
  saveFile: vi.fn(), ensureDir: vi.fn(), readAsset: vi.fn(), archive: vi.fn(), mail: vi.fn(), invalidate: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: m.session }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Plugin', () => ({ default: { findById: m.find, create: m.create } }))
vi.mock('@/lib/pluginManifest', async () => ({ readManifestFromPlugin: m.manifest, ...(await import('@/lib/semverCompare.js')) }))
vi.mock('@/lib/pluginValidation', () => ({ validatePluginArchive: m.validate, OTZARIA_DESIGN_TAG: 'מראה תואם לאוצריא' }))
vi.mock('@/lib/pluginSearchIndex', () => ({ invalidatePluginSearchIndex: m.invalidate }))
vi.mock('@/lib/cacheTags', () => ({ CACHE_TAGS: { PLUGINS_PUBLIC: 'plugins' }, revalidateNow: vi.fn() }))
vi.mock('@/lib/emailService', () => ({ sendPluginUploadNotification: m.mail }))
vi.mock('@/lib/systemMessages', () => ({ sendPluginReportNoticeIfNeeded: vi.fn() }))
vi.mock('@/lib/pluginVersions', () => ({ archiveCurrentVersion: m.archive }))
vi.mock('@/lib/pluginStorage', () => ({
  MAX_PLUGIN_BYTES: 50 * 1024 * 1024, MAX_IMAGE_BYTES: 5 * 1024 * 1024, MAX_SCREENSHOT_BYTES: 5 * 1024 * 1024, MAX_SCREENSHOTS: 10,
  PLUGIN_FILE_BASENAME: 'plugin', IMAGE_BASENAME: 'image', ensurePluginDir: m.ensureDir,
  saveFileFromFormData: m.saveFile, readPluginAsset: m.readAsset,
  deletePluginDir: vi.fn(), deletePendingPluginDir: vi.fn(), getPendingPluginDir: vi.fn(),
  isAllowedImage: vi.fn(() => true), imageExtFromMime: vi.fn(() => '.png'),
  saveOptimizedImage: vi.fn(), clearImageOptCache: vi.fn(), removePluginAsset: vi.fn(),
}))

import { POST } from './route'
import { PUT } from '@/app/api/admin/plugins/[id]/edit/route'

const context = { params: Promise.resolve({ id: '0123456789abcdef01234567' }) }
const newManifest = { id: 'test.plugin', name: 'בדיקה', version: '2.0.0', author: 'בודק', description: 'תיאור', minAppVersion: '0.9.97', stability: 'stable' }
let plugin: Record<string, unknown>
function request({ file = true, tags = '[]', bytes = 8 } = {}) {
  const data = new FormData()
  for (const [k, v] of Object.entries({ name: 'בדיקה', version: '2.0.0', author: 'בודק', description: 'תיאור ארוך', shortDescription: 'תיאור', reportsConsent: 'true', tags })) data.set(k, v)
  if (file) data.set('pluginFile', new File([new Uint8Array(bytes)], 'test.otzplugin'))
  return { formData: async () => data } as Request
}
function expectNoWrites() {
  expect(m.create).not.toHaveBeenCalled()
  expect(m.saveFile).not.toHaveBeenCalled()
  expect(m.ensureDir).not.toHaveBeenCalled()
  expect(m.archive).not.toHaveBeenCalled()
  expect(plugin.save).not.toHaveBeenCalled()
  expect(m.mail).not.toHaveBeenCalled()
  expect(m.invalidate).not.toHaveBeenCalled()
}
beforeEach(() => {
  vi.clearAllMocks()
  plugin = { _id: '0123456789abcdef01234567', authorId: 'owner', pluginUid: 'test.plugin', name: 'בדיקה', version: '1.0.0', author: 'בודק', shortDescription: 'תיאור', description: 'תיאור', status: 'stable', compatibleWith: '0.9.97', isApproved: true, save: vi.fn() }
  m.session.mockResolvedValue({ user: { id: 'owner', role: 'user' } })
  m.find.mockResolvedValue(plugin)
  m.manifest.mockResolvedValue(newManifest)
  m.validate.mockResolvedValue({ errors: [], warnings: [], advisories: [], design: { compliant: false, violations: [] } })
  m.readAsset.mockResolvedValue(Buffer.from('old archive'))
})

describe('plugin submission fails closed', () => {
  for (const route of ['upload', 'edit'] as const) {
    const invoke = () => route === 'upload' ? POST(request()) : PUT(request(), context)
    for (const code of ['PLUGIN_VALIDATION_TIMEOUT', 'PLUGIN_VALIDATION_BUSY', 'PLUGIN_VALIDATION_FAILED']) {
      it(`${route}: ${code} cannot save files or metadata`, async () => {
        m.validate.mockRejectedValue(Object.assign(new Error('validation unavailable'), { code }))
        const res = await invoke()
        expect(res.status).toBe(503)
        expect((await res.json()).error).toContain('לא נשמר')
        expectNoWrites()
      })
    }
    for (const bucket of ['errors', 'warnings']) {
      it(`${route}: ${bucket} still rejects invalid plugins`, async () => {
        m.validate.mockResolvedValue({ errors: [], warnings: [], [bucket]: ['bad plugin'] })
        const res = await invoke(); expect(res.status).toBe(400); expectNoWrites()
      })
    }
    it(`${route}: manifest failure cannot save`, async () => {
      m.manifest.mockRejectedValue(new Error('bad manifest'))
      const res = await invoke(); expect(res.status).toBe(400); expectNoWrites()
    })
    it(`${route}: unauthenticated callers never run validation`, async () => {
      m.session.mockResolvedValue(null)
      const res = await invoke(); expect(res.status).toBe(401)
      expect(m.validate).not.toHaveBeenCalled(); expectNoWrites()
    })
  }
  it('edit: nonowners never run validation', async () => {
    m.session.mockResolvedValue({ user: { id: 'other', role: 'user' } })
    expect((await PUT(request(), context)).status).toBe(403)
    expect(m.validate).not.toHaveBeenCalled(); expectNoWrites()
  })
  for (const code of ['PLUGIN_VALIDATION_TIMEOUT', 'PLUGIN_VALIDATION_BUSY', 'PLUGIN_VALIDATION_FAILED']) {
    it(`edit: legacy identity lookup ${code} cannot bypass immutable plugin id`, async () => {
      plugin.pluginUid = null
      m.manifest.mockResolvedValueOnce(newManifest).mockRejectedValueOnce(Object.assign(new Error('old archive unavailable'), { code }))
      expect((await PUT(request(), context)).status).toBe(503)
      expectNoWrites()
    })
  }
  it('edit: legacy manifest without an id cannot authorize a replacement id', async () => {
    plugin.pluginUid = null
    m.manifest.mockResolvedValueOnce(newManifest).mockResolvedValueOnce({})
    expect((await PUT(request(), context)).status).toBe(503); expectNoWrites()
  })
  it('edit: changing a known plugin id is rejected', async () => {
    m.manifest.mockResolvedValue({ ...newManifest, id: 'other.plugin' })
    expect((await PUT(request(), context)).status).toBe(400); expectNoWrites()
  })
})

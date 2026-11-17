// @vitest-environment node
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ find: vi.fn(), getSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.getSession }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Plugin', () => ({ default: { findById: mocks.find } }))

import { GET } from './route'
import {
  ensurePluginDir, ensurePendingPluginDir, saveOptimizedImage, promotePendingPluginImage,
  backfillPluginCardThumbnail, getOptCachePath,
} from '@/lib/pluginStorage'

const id = 'a'.repeat(24)
const requestImage = (params = '') => GET(new Request(`https://test.invalid/api/plugins/${id}/image${params}`), {
  params: Promise.resolve({ id }),
})
const png = (background = '#008852') =>
  sharp({ create: { width: 600, height: 400, channels: 3, background } }).png().toBuffer()
const width = async (response) => (await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width

let root, dir, plugin
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'otzaria-plugin-image-'))
  vi.stubEnv('PLUGIN_STORAGE_DIR', root)
  dir = await ensurePluginDir(id)
  plugin = { isApproved: true, authorId: 'owner', image: { ext: '.png', contentType: 'image/png' } }
  mocks.find.mockReturnValue({ select: () => ({ lean: async () => plugin }) })
  mocks.getSession.mockReset().mockResolvedValue(null)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { force: true, recursive: true })
})

it('מגיש ממוזער שנוצר בהעלאה, ללא session, ומשאיר תמונה גדולה בפרטי התוסף', async () => {
  plugin.image = await saveOptimizedImage(new File([await png()], 'image.png', { type: 'image/png' }), dir, 'image')
  expect(await width(await requestImage('?size=card'))).toBe(144)
  expect(await width(await requestImage())).toBe(600)
  expect(mocks.getSession).not.toHaveBeenCalled()
})

it('תמונת המתנה פרטית וגרסת הכרטיס שלה עוברת עם האישור', async () => {
  const pending = await ensurePendingPluginDir(id)
  const image = await saveOptimizedImage(new File([await png()], 'image.png', { type: 'image/png' }), pending, 'image')
  plugin.pendingUpdate = { image, assetSources: { image: 'pending' } }
  expect((await requestImage('?pending=1&size=card')).status).toBe(404)
  mocks.getSession.mockResolvedValue({ user: { id: 'owner' } })
  const authorized = await requestImage('?pending=1&size=card')
  expect(authorized.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await width(authorized)).toBe(144)
  await promotePendingPluginImage(id, image.ext)
  plugin.image = image
  expect(await width(await requestImage('?size=card'))).toBe(144)
})

it('שומר תאימות לקבצים ישנים, והחלפת מקור פוסלת את הממוזער הישן', async () => {
  const target = join(dir, 'image.png')
  await writeFile(target, await png())
  const legacy = await requestImage('?size=card')
  expect(legacy.headers.get('Cache-Control')).toBe('public, max-age=300')
  expect(await width(legacy)).toBe(600)
  expect(await backfillPluginCardThumbnail(id, '.png')).toBe(true)
  expect(await backfillPluginCardThumbnail(id, '.png')).toBe(false)
  expect(await width(await requestImage('?size=card'))).toBe(144)
  await writeFile(target + '.new', await png('#121983'))
  await rename(target + '.new', target)
  expect(await width(await requestImage('?size=card'))).toBe(600)
})

it('יכול להגיש מטמון WebP ישן בלי לקרוא את המקור, ושומר אותו פרטי לתוסף מושהה', async () => {
  const cached = await sharp(await png()).webp().toBuffer()
  await writeFile(getOptCachePath(id), cached)
  plugin.isSuspended = true
  expect((await requestImage()).status).toBe(404)
  mocks.getSession.mockResolvedValue({ user: { id: 'owner' } })
  const response = await requestImage()
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('Content-Type')).toBe('image/webp')
  expect(Buffer.from(await response.arrayBuffer())).toEqual(cached)
})

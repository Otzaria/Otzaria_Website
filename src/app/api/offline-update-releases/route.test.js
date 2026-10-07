// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET } from './route'
let fetchMock
const request = () => new Request('https://otzaria.org/api/offline-update-releases?type=stable')
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('returns releases with public cache policy', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => [{ tag_name: 'v1', html_url: 'https://github.com/release/v1', assets: [] }] })
  const response = await GET(request()); expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=1200')
  expect(await response.json()).toMatchObject({ version: 'v1', releaseUrl: 'https://github.com/release/v1' })
})
it('returns 404 without success caching when no release exists', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] })
  const response = await GET(request()); expect(response.status).toBe(404)
  expect(response.headers.get('Cache-Control')).toBeNull(); expect(await response.json()).toEqual({ error: 'No release found' })
})
it.each(['http', 'network', 'json', 'timeout', 'shape'])('returns 500 without success caching for %s', async kind => {
  if (kind === 'http') fetchMock.mockResolvedValue({ ok: false, status: 429 })
  if (kind === 'network') fetchMock.mockRejectedValue(new Error('refused'))
  if (kind === 'timeout') fetchMock.mockRejectedValue(new DOMException('deadline', 'TimeoutError'))
  if (kind === 'json') fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('json') } })
  if (kind === 'shape') fetchMock.mockResolvedValue({ ok: true, json: async () => ({ invalid: true }) })
  const response = await GET(request()); expect(response.status).toBe(500)
  expect(response.headers.get('Cache-Control')).toBeNull(); expect(await response.json()).toEqual({ error: 'Failed to fetch releases' })
})

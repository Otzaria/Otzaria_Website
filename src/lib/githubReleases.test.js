// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAppDownloads, getOfflineUpdateRelease, ReleaseNotFoundError } from './githubReleases'

const asset = name => ({ name, browser_download_url: `https://downloads.example/${name}`, size: 42 })
const release = (tag, assets = [], extra = {}) => ({ tag_name: tag, html_url: `https://github.com/releases/${tag}`, assets: assets.map(asset), ...extra })
let fetchMock
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const respond = data => fetchMock.mockResolvedValue({ ok: true, json: async () => data })

describe('shared release loader', () => {
  it('preserves stable per-platform fallback and rejects drafts/prereleases', async () => {
    respond([release('draft', ['windows.exe'], { draft: true }), release('dev', ['windows.exe'], { prerelease: true }), release('new', ['app-release.apk']), release('old', ['otzaria-windows.exe', 'otzaria-linux.deb'])])
    const downloads = await getAppDownloads()
    expect(downloads.version).toBe('new')
    expect(downloads.versions).toEqual({ windows: 'old', linux: 'old', android: 'new' })
    expect(downloads.windows.exe).toBe('https://downloads.example/otzaria-windows.exe')
    expect(downloads.releaseUrl).toBe('https://github.com/releases/new')
  })
  it('uses only the latest non-draft prerelease for dev', async () => {
    respond([release('draft-dev', ['windows.exe'], { prerelease: true, draft: true }), release('dev', ['app-release.apk'], { prerelease: true }), release('older-dev', ['otzaria-windows.exe'], { prerelease: true }), release('stable', ['otzaria-windows.exe'])])
    const downloads = await getAppDownloads('dev')
    expect(downloads.version).toBe('dev')
    expect(downloads.windows).toBeUndefined()
    expect(downloads.versions).toEqual({ android: 'dev' })
  })
  it('unknown types retain the stable behavior', async () => {
    respond([release('stable')]); expect((await getAppDownloads('other')).version).toBe('stable')
  })
  it('has the original cache interval, a deadline, and no dependence on NEXTAUTH_URL', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://unavailable.example')
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    respond([release('stable')]); await getAppDownloads()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/otzaria/otzaria/releases?per_page=20')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ next: { revalidate: 600 }, headers: { 'User-Agent': 'Otzaria-Website' } })
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(timeout).toHaveBeenCalledWith(10000)
    vi.unstubAllEnvs()
  })
  it.each([{ data: [] }, { data: [release('dev', [], { prerelease: true })] }, { data: [release('draft', [], { draft: true })] }])('reports no stable releases', async ({ data }) => {
    respond(data); await expect(getAppDownloads()).rejects.toBeInstanceOf(ReleaseNotFoundError)
  })
  it('reports no dev release', async () => {
    respond([release('stable')]); await expect(getAppDownloads('dev')).rejects.toBeInstanceOf(ReleaseNotFoundError)
  })
  it('rejects non-array JSON', async () => {
    respond({ message: 'bad' }); await expect(getAppDownloads()).rejects.toThrow('Invalid response')
  })
  it('rejects rate limits', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 }); await expect(getAppDownloads()).rejects.toThrow('Failed to fetch')
  })
  it('propagates malformed JSON and network failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('bad JSON') } }).mockRejectedValueOnce(new Error('network'))
    await expect(getAppDownloads()).rejects.toThrow('bad JSON'); await expect(getAppDownloads()).rejects.toThrow('network')
  })
  it('abort deadline reaches the pending fetch', async () => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
    const promise = getAppDownloads()
    controller.abort(new DOMException('deadline', 'TimeoutError'))
    await expect(promise).rejects.toMatchObject({ name: 'TimeoutError' })
  })
  it('selects stable offline assets and preserves metadata', async () => {
    respond([release('dev', [], { prerelease: true }), release('stable', ['installer.EXE', 'Otzaria-macOS.ZIP', 'linux.zip'], { published_at: '2026-10-07' })])
    const data = await getOfflineUpdateRelease()
    expect(data).toMatchObject({ version: 'stable', publishedAt: '2026-10-07', windows: { name: 'installer.EXE', size: 42 }, macos: { name: 'Otzaria-macOS.ZIP', size: 42 } })
    expect(fetchMock.mock.calls[0][0]).toContain('/Otzaria/Otzaria_Offline_update/releases?per_page=10')
  })
  it('allows missing optional offline platform assets', async () => {
    respond([release('stable')]); const data = await getOfflineUpdateRelease(); expect(data.windows).toBeUndefined(); expect(data.macos).toBeUndefined()
  })
  it('reports no stable offline release', async () => {
    respond([]); await expect(getOfflineUpdateRelease()).rejects.toBeInstanceOf(ReleaseNotFoundError)
  })
})

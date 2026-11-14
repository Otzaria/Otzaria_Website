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
  it('uses the designated latest release for every platform, without falling back to another release', async () => {
    respond(release('1.0.0+810', ['app-release.apk', 'otzaria-windows.exe']))
    const downloads = await getAppDownloads()
    expect(downloads.version).toBe('1.0.0+810')
    expect(downloads.versions).toEqual({ windows: '1.0.0+810', android: '1.0.0+810' })
    expect(downloads.windows.exe).toBe('https://downloads.example/otzaria-windows.exe')
    expect(downloads.linux).toBeUndefined()
    expect(downloads.releaseUrl).toBe('https://github.com/releases/1.0.0+810')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/otzaria/otzaria/releases/latest')
  })
  it.each(['dev', 'stable', 'other'])('legacy type %s cannot select a different release', async type => {
    respond(release('1.0.0+810'))
    expect((await getAppDownloads(type)).version).toBe('1.0.0+810')
    expect(fetchMock.mock.calls[0][0]).toMatch(/releases\/latest$/)
  })
  it('has the original cache interval, a deadline, and no dependence on NEXTAUTH_URL', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://unavailable.example')
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    respond(release('1.0.0')); await getAppDownloads()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/otzaria/otzaria/releases/latest')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ next: { revalidate: 600 }, headers: { 'User-Agent': 'Otzaria-Website' } })
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(timeout).toHaveBeenCalledWith(10000)
    vi.unstubAllEnvs()
  })
  it.each(['draft', 'prerelease'])('rejects an ineligible latest response: %s', async flag => {
    respond(release('1.0.0', [], { [flag]: true }))
    await expect(getAppDownloads()).rejects.toBeInstanceOf(ReleaseNotFoundError)
  })
  it('reports no latest release on 404 without trying a release list', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await expect(getAppDownloads()).rejects.toBeInstanceOf(ReleaseNotFoundError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it.each([null, [], [release('2.0.0')], {}, { tag_name: '1.0.0' }])('rejects invalid latest JSON: %j', async data => {
    respond(data); await expect(getAppDownloads()).rejects.toThrow('Invalid response')
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
  it('selects the offline tool latest release and preserves metadata', async () => {
    respond(release('v0.28.0', ['installer.EXE', 'Otzaria-macOS.ZIP', 'linux.zip'], { published_at: '2026-10-07' }))
    const data = await getOfflineUpdateRelease()
    expect(data).toMatchObject({ version: 'v0.28.0', publishedAt: '2026-10-07', windows: { name: 'installer.EXE', size: 42 }, macos: { name: 'Otzaria-macOS.ZIP', size: 42 } })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/Otzaria/Otzaria_Offline_update/releases/latest')
  })
  it('allows missing optional offline platform assets', async () => {
    respond(release('v0.28.0')); const data = await getOfflineUpdateRelease(); expect(data.windows).toBeUndefined(); expect(data.macos).toBeUndefined()
  })
  it.each(['V1', 'v0.28', 'bundle'])('rejects an unsupported offline tool tag: %s', async tag => {
    respond(release(tag)); await expect(getOfflineUpdateRelease()).rejects.toBeInstanceOf(ReleaseNotFoundError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

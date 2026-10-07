import { afterEach, expect, it, vi } from 'vitest'
import OfflineUpdateDownload from './OfflineUpdateDownload'
const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/lib/githubReleases', () => ({ getOfflineUpdateRelease: load }))
afterEach(() => vi.restoreAllMocks())
it('passes server-loaded offline metadata and repo link to client', async () => {
  const data = { version: 'v1', windows: { url: 'https://downloads.example/app.exe' } }; load.mockResolvedValue(data)
  const element = await OfflineUpdateDownload({ repoUrl: 'https://github.com/Otzaria/Otzaria_Offline_update' })
  expect(element.props.releases).toBe(data); expect(element.props.repoUrl).toContain('Otzaria_Offline_update')
})
it('keeps client fallback available when GitHub is down', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); load.mockRejectedValue(new Error('offline'))
  expect((await OfflineUpdateDownload({ repoUrl: 'repo' })).props.releases).toBeNull()
})

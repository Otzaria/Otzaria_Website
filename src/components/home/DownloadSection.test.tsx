import { afterEach, expect, it, vi } from 'vitest'
import DownloadSection from './DownloadSection'
const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/lib/githubReleases', () => ({ getAppDownloads: load }))
afterEach(() => vi.restoreAllMocks())
it('passes server-loaded links to the existing client', async () => {
  const data = { version: 'v1', windows: { exe: 'https://downloads.example/app.exe' } }; load.mockResolvedValue(data)
  const element = await DownloadSection(); expect(element.props.stableDownloads).toBe(data); expect(load).toHaveBeenCalledWith('stable')
})
it('keeps client fallback available when GitHub is down', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); load.mockRejectedValue(new Error('offline'))
  expect((await DownloadSection()).props.stableDownloads).toBeNull()
})

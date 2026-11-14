import { afterEach, describe, expect, it, vi } from 'vitest'
import HeroStatsLoader from './HeroStatsLoader'

const { release } = vi.hoisted(() => ({ release: vi.fn() }))
vi.mock('@/lib/githubReleases', () => ({ getAppDownloads: release }))
vi.mock('@/lib/homeStats/sources', () => ({
  HOME_STATS_SOURCE_TIMEOUT_MS: 3000,
  getLibraryStats: async () => ({ books: 7367, links: null }),
  getAppDownloadCount: async () => 73152,
  getPublicPluginsCount: async () => null
}))
afterEach(() => vi.restoreAllMocks())

describe('HeroStatsLoader', () => {
  it('מעביר את הנתונים התקינים ואת הגרסה בלי מספר הבנייה', async () => {
    release.mockResolvedValue({ version: 'v0.9.98+801' })
    const element = await HeroStatsLoader({})
    expect(element.props.items.map((item: { key: string }) => item.key)).toEqual(['books', 'downloads'])
    expect(element.props.version).toBe('0.9.98')
    expect(release).toHaveBeenCalledWith()
  })

  it('release לא זמין — בלי גרסה, שאר הנתונים נשארים', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    release.mockRejectedValue(new Error('offline'))
    const element = await HeroStatsLoader({})
    expect(element.props.version).toBeNull()
    expect(element.props.items).toHaveLength(2)
  })
})

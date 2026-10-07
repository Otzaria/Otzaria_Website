import { extractPlatformDownloads, hasPlatformAssets } from './githubReleaseAssets.js'

export const RELEASE_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=1200'
const APP_RELEASES_URL = 'https://api.github.com/repos/otzaria/otzaria/releases?per_page=20'
const OFFLINE_RELEASES_URL = 'https://api.github.com/repos/Otzaria/Otzaria_Offline_update/releases?per_page=10'

export class ReleaseNotFoundError extends Error {
  constructor() {
    super('No release found')
    this.name = 'ReleaseNotFoundError'
  }
}

// Shared by API routes and server components. Never fetch this application's
// own HTTP API during prerender: the live server may be unavailable during deploy.
async function fetchReleases(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Otzaria-Website' },
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Failed to fetch releases')
  const releases = await response.json()
  if (!Array.isArray(releases)) throw new Error('Invalid response from GitHub')
  return releases
}

export async function getAppDownloads(type = 'stable') {
  const releases = await fetchReleases(APP_RELEASES_URL)
  const candidates = type === 'dev'
    ? releases.filter(r => r.prerelease && !r.draft).slice(0, 1)
    : releases.filter(r => !r.prerelease && !r.draft)
  if (!candidates.length) throw new ReleaseNotFoundError()
  const data = {}
  /** @type {Record<string, string>} */
  const versions = {}
  for (const platform of ['windows', 'linux', 'macos', 'android']) {
    for (const release of candidates) {
      const links = extractPlatformDownloads(platform, release.assets || [])
      if (hasPlatformAssets(links)) {
        data[platform] = links
        versions[platform] = release.tag_name
        break
      }
    }
  }
  return { version: candidates[0].tag_name, versions, ...data, releaseUrl: candidates[0].html_url }
}

export async function getOfflineUpdateRelease() {
  const releases = await fetchReleases(OFFLINE_RELEASES_URL)
  const latest = releases.find(r => !r.prerelease && !r.draft)
  if (!latest) throw new ReleaseNotFoundError()
  const assets = latest.assets || []
  const findAsset = predicate => {
    const asset = assets.find(predicate)
    return asset ? { url: asset.browser_download_url, size: asset.size, name: asset.name } : undefined
  }
  return {
    version: latest.tag_name,
    publishedAt: latest.published_at,
    releaseUrl: latest.html_url,
    windows: findAsset(a => a.name.toLowerCase().endsWith('.exe')),
    macos: findAsset(a => a.name.toLowerCase().includes('macos') && a.name.toLowerCase().endsWith('.zip')),
  }
}

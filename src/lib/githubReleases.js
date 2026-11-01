import { extractPlatformDownloads, hasPlatformAssets } from './githubReleaseAssets.js'

export const RELEASE_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=1200'
const APP_RELEASES_URL = 'https://api.github.com/repos/otzaria/otzaria/releases/latest'
const OFFLINE_RELEASES_URL = 'https://api.github.com/repos/Otzaria/Otzaria_Offline_update/releases/latest'

export class ReleaseNotFoundError extends Error {
  constructor() {
    super('No release found')
    this.name = 'ReleaseNotFoundError'
  }
}

// Shared by API routes and server components. Never fetch this application's
// own HTTP API during prerender: the live server may be unavailable during deploy.
async function fetchLatestRelease(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Otzaria-Website' },
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 404) throw new ReleaseNotFoundError()
  if (!response.ok) throw new Error('Failed to fetch releases')
  const release = await response.json()
  if (!release || Array.isArray(release) || typeof release !== 'object' ||
      typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) {
    throw new Error('Invalid response from GitHub')
  }
  if (release.draft || release.prerelease) throw new ReleaseNotFoundError()
  return release
}

export async function getAppDownloads() {
  const release = await fetchLatestRelease(APP_RELEASES_URL)
  const data = {}
  /** @type {Record<string, string>} */
  const versions = {}
  for (const platform of ['windows', 'linux', 'macos', 'android']) {
    const links = extractPlatformDownloads(platform, release.assets)
    if (hasPlatformAssets(links)) {
      data[platform] = links
      versions[platform] = release.tag_name
    }
  }
  return { version: release.tag_name, versions, ...data, releaseUrl: release.html_url }
}

export async function getOfflineUpdateRelease() {
  const latest = await fetchLatestRelease(OFFLINE_RELEASES_URL)
  if (!/^v\d+\.\d+\.\d+$/.test(latest.tag_name)) throw new ReleaseNotFoundError()
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

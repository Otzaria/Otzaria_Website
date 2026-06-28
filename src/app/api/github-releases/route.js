import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';
export const revalidate = 600

const platformAliases = {
  windows: ['windows', 'win'],
  linux: ['linux'],
  macos: ['macos', 'mac', 'darwin', 'osx'],
  android: ['android']
}

const otherPlatformKeywords = {
  windows: [...platformAliases.linux, ...platformAliases.macos, ...platformAliases.android],
  linux: [...platformAliases.windows, ...platformAliases.macos, ...platformAliases.android],
  macos: [...platformAliases.windows, ...platformAliases.linux, ...platformAliases.android],
  android: [...platformAliases.windows, ...platformAliases.linux, ...platformAliases.macos]
}

function findAssetWithKeywords(assets, extension, includeKeywords = [], excludeKeywords = []) {
  const lowerExtension = extension.toLowerCase()
  const lowerIncludeKeywords = includeKeywords.map(k => k.toLowerCase())
  const lowerExcludeKeywords = excludeKeywords.map(k => k.toLowerCase())

  return assets.find(a => {
    const name = a.name.toLowerCase()
    return name.endsWith(lowerExtension) &&
           lowerIncludeKeywords.every(k => name.includes(k)) &&
           lowerExcludeKeywords.every(k => !name.includes(k))
  })?.browser_download_url
}

function findPlatformAsset(assets, platform, extension, { full = false, preferPlatformKeyword = true } = {}) {
  const includeKeywords = full ? ['full'] : []
  const excludeKeywords = full ? [] : ['full']
  const aliases = platformAliases[platform] || []
  const excludedPlatforms = otherPlatformKeywords[platform] || []

  if (preferPlatformKeyword) {
    for (const alias of aliases) {
      const asset = findAssetWithKeywords(assets, extension, [...includeKeywords, alias], excludeKeywords)
      if (asset) return asset
    }
  }

  return findAssetWithKeywords(assets, extension, includeKeywords, [...excludeKeywords, ...excludedPlatforms])
}

function extractPlatformDownloads(platform, assets) {
  switch (platform) {
    case 'windows':
      return {
        exe: findAssetWithKeywords(assets, '.exe', ['windows'], ['silent', 'full']) || findAssetWithKeywords(assets, '.exe', ['win'], ['silent', 'full']),
        msix: findPlatformAsset(assets, 'windows', '.msix'),
        zip: findPlatformAsset(assets, 'windows', '.zip'),
        exeSilent: findAssetWithKeywords(assets, '.exe', ['windows', 'silent'], ['full']) || findAssetWithKeywords(assets, '.exe', ['win', 'silent'], ['full']),
        exeFull: findAssetWithKeywords(assets, '.exe', ['windows', 'full'], ['silent']) || findAssetWithKeywords(assets, '.exe', ['win', 'full'], ['silent'])
      }
    case 'linux':
      return {
        deb: findPlatformAsset(assets, 'linux', '.deb'),
        rpm: findPlatformAsset(assets, 'linux', '.rpm'),
        appimage: findPlatformAsset(assets, 'linux', '.AppImage', { preferPlatformKeyword: false }),
        tarFull: findAssetWithKeywords(assets, '.tar.gz', ['full'], ['silent'])
      }
    case 'macos':
      return {
        dmg: findPlatformAsset(assets, 'macos', '.dmg'),
        zip: findPlatformAsset(assets, 'macos', '.zip'),
        zipFull: findAssetWithKeywords(assets, '.zip', ['macos', 'full'], ['silent']) || findAssetWithKeywords(assets, '.zip', ['mac', 'full'], ['silent'])
      }
    case 'android':
      return {
        apk: findPlatformAsset(assets, 'android', '.apk', { preferPlatformKeyword: false }),
        zipFull: findAssetWithKeywords(assets, '.zip', ['android', 'full'], ['silent'])
      }
    default:
      return {}
  }
}

function hasPlatformAssets(data) {
  return Object.values(data).some(v => v)
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'stable'

    const response = await fetch('https://api.github.com/repos/otzaria/otzaria/releases?per_page=20', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Otzaria-Website'
      },
      next: { revalidate: 600 }
    })

    if (!response.ok) throw new Error('Failed to fetch releases')
    const allReleases = await response.json()
    if (!Array.isArray(allReleases)) throw new Error('Invalid response from GitHub')

    let candidateReleases
    if (type === 'dev') {
      const devRelease = allReleases.find(r => r.prerelease)
      candidateReleases = devRelease ? [devRelease] : []
    } else {
      candidateReleases = allReleases.filter(r => !r.prerelease && !r.draft)
    }

    if (candidateReleases.length === 0) {
      return NextResponse.json({ error: 'No release found' }, { status: 404 })
    }

    const latestRelease = candidateReleases[0]
    const platforms = ['windows', 'linux', 'macos', 'android']
    const platformData = {}
    const platformVersions = {}

    // For each platform, find the most recent release that has assets for it
    for (const platform of platforms) {
      for (const release of candidateReleases) {
        const data = extractPlatformDownloads(platform, release.assets || [])
        if (hasPlatformAssets(data)) {
          platformData[platform] = data
          platformVersions[platform] = release.tag_name
          break
        }
      }
    }

    return NextResponse.json({
      version: latestRelease.tag_name,
      versions: platformVersions,
      ...platformData,
      releaseUrl: latestRelease.html_url
    })
  } catch (error) {
    console.error('Error fetching GitHub releases:', error)
    return NextResponse.json(
      { error: 'Failed to fetch releases' },
      { status: 500 }
    )
  }
}

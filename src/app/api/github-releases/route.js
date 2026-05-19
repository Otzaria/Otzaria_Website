import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'; // <--- שורה זו נוספה לתיקון השגיאה
export const revalidate = 600

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'stable' // stable or dev
    
    // Fetch releases from GitHub
    const url = type === 'dev' 
      ? 'https://api.github.com/repos/otzaria/otzaria/releases'
      : 'https://api.github.com/repos/otzaria/otzaria/releases/latest'
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Otzaria-Website'
      },
      next: { revalidate: 600 }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch releases')
    }

    const data = await response.json()
    
    // For dev releases, get the first prerelease
    const release = type === 'dev' 
      ? (Array.isArray(data) ? data.find(r => r.prerelease) || data[0] : data)
      : data

    if (!release) {
        return NextResponse.json({ error: 'No release found' }, { status: 404 })
    }

    const assets = release.assets || []
    
    const findAssetWithKeywords = (extension, includeKeywords = [], excludeKeywords = []) => {
      const lowerExtension = extension.toLowerCase()
      const lowerIncludeKeywords = includeKeywords.map(keyword => keyword.toLowerCase())
      const lowerExcludeKeywords = excludeKeywords.map(keyword => keyword.toLowerCase())

      return assets.find(a => {
        const name = a.name.toLowerCase()
        return name.endsWith(lowerExtension) &&
               lowerIncludeKeywords.every(keyword => name.includes(keyword)) &&
               lowerExcludeKeywords.every(keyword => !name.includes(keyword))
      })?.browser_download_url
    }

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

    const findPlatformAsset = (platform, extension, { full = false, preferPlatformKeyword = true } = {}) => {
      const includeKeywords = full ? ['full'] : []
      const excludeKeywords = full ? [] : ['full']

      const aliases = platformAliases[platform] || []
      const excludedPlatforms = otherPlatformKeywords[platform] || []

      if (preferPlatformKeyword) {
        for (const alias of aliases) {
          const asset = findAssetWithKeywords(extension, [...includeKeywords, alias], excludeKeywords)
          if (asset) return asset
        }
      }

      return findAssetWithKeywords(extension, includeKeywords, [...excludeKeywords, ...excludedPlatforms])
    }

    const downloads = {
      version: release.tag_name,
      windows: {
        exe: findAssetWithKeywords('.exe', ['windows'], ['silent', 'full']) || findAssetWithKeywords('.exe', ['win'], ['silent', 'full']),
        msix: findPlatformAsset('windows', '.msix'),
        zip: findPlatformAsset('windows', '.zip'),
        exeSilent: findAssetWithKeywords('.exe', ['windows', 'silent'], ['full']) || findAssetWithKeywords('.exe', ['win', 'silent'], ['full']),
        exeFull: findPlatformAsset('windows', '.exe', { full: true })
      },
      linux: {
        deb: findPlatformAsset('linux', '.deb'),
        rpm: findPlatformAsset('linux', '.rpm'),
        appimage: findPlatformAsset('linux', '.AppImage', { preferPlatformKeyword: false }),
        tarFull: findPlatformAsset('linux', '.tar.gz', { full: true, preferPlatformKeyword: false })
      },
      macos: {
        dmg: findPlatformAsset('macos', '.dmg'),
        zip: findPlatformAsset('macos', '.zip'),
        zipFull: findPlatformAsset('macos', '.zip', { full: true })
      },
      android: {
        apk: findPlatformAsset('android', '.apk', { preferPlatformKeyword: false }),
        zipFull: findPlatformAsset('android', '.zip', { full: true })
      },
      releaseUrl: release.html_url
    }

    return NextResponse.json(downloads)
  } catch (error) {
    console.error('Error fetching GitHub releases:', error)
    return NextResponse.json(
      { error: 'Failed to fetch releases' },
      { status: 500 }
    )
  }
}

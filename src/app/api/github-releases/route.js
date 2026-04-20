import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'; // <--- שורה זו נוספה לתיקון השגיאה
export const revalidate = 600

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'stable' // stable or dev
    
    // Fetch releases from GitHub
    const url = type === 'dev' 
      ? 'https://api.github.com/repos/Y-PLONI/otzaria/releases'
      : 'https://api.github.com/repos/Y-PLONI/otzaria/releases/latest'
    
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
    
    const findAsset = (extension, keyword = '') => {
        return assets.find(a => {
            const name = a.name.toLowerCase();
            return name.endsWith(extension.toLowerCase()) && 
                   (!keyword || name.includes(keyword.toLowerCase()));
        })?.browser_download_url;
    }

    // Helper to find Windows ZIP - prioritize files with 'windows' in name, then exclude other platforms
    const findWindowsZip = () => {
      // First try to find a ZIP with 'windows' in the name
      let zip = assets.find(a => a.name.toLowerCase().includes('windows') && a.name.endsWith('.zip'))?.browser_download_url;
      if (zip) return zip;
      
      // Otherwise find a ZIP that's not for other platforms
      zip = assets.find(a => 
        a.name.endsWith('.zip') && 
        !a.name.toLowerCase().includes('mac') && 
        !a.name.toLowerCase().includes('darwin') &&
        !a.name.toLowerCase().includes('linux') && 
        !a.name.toLowerCase().includes('android')
      )?.browser_download_url;
      return zip;
    }

    const downloads = {
      version: release.tag_name,
      windows: {
        exe: findAsset('.exe'),
        msix: findAsset('.msix'),
        zip: findWindowsZip(),
        exeFull: findAsset('.exe', 'full')
      },
      linux: {
        deb: findAsset('.deb'),
        rpm: findAsset('.rpm'),
        appimage: findAsset('.AppImage') || findAsset('.appimage'),
        tarFull: findAsset('.tar.gz', 'full')
      },
      macos: {
        dmg: findAsset('.dmg'),
        zip: assets.find(a => a.name.endsWith('.zip') && (a.name.toLowerCase().includes('mac') || a.name.toLowerCase().includes('darwin')))?.browser_download_url,
        zipFull: assets.find(a => a.name.endsWith('.zip') && a.name.toLowerCase().includes('full') && (a.name.toLowerCase().includes('mac') || a.name.toLowerCase().includes('darwin')))?.browser_download_url
      },
      android: {
        apk: findAsset('.apk'),
        zipFull: findAsset('.zip', 'full')
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
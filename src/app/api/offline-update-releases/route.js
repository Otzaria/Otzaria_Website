import { NextResponse } from 'next/server'

// דינמי כמו /api/github-releases — המטמון האמיתי הוא על ה-fetch ל-GitHub למטה.
export const dynamic = 'force-dynamic'

const RELEASES_URL = 'https://api.github.com/repos/Otzaria/Otzaria_Offline_update/releases?per_page=10'

function findAsset(assets, predicate) {
  const asset = assets.find(predicate)
  return asset ? { url: asset.browser_download_url, size: asset.size, name: asset.name } : undefined
}

/**
 * הגרסה היציבה האחרונה של "עדכוני אוצריא" (כלי העדכון הלא-מקוון).
 * מחזיר את קובץ ההתקנה ל-Windows ואת חבילת ה-macOS מה-release האחרון שאינו prerelease/draft.
 */
export async function GET() {
  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Otzaria-Website'
      },
      next: { revalidate: 600 }
    })

    if (!response.ok) throw new Error('Failed to fetch releases')
    const releases = await response.json()
    if (!Array.isArray(releases)) throw new Error('Invalid response from GitHub')

    const latest = releases.find(r => !r.prerelease && !r.draft)
    if (!latest) {
      return NextResponse.json({ error: 'No release found' }, { status: 404 })
    }

    const assets = latest.assets || []
    const lower = (a) => a.name.toLowerCase()

    return NextResponse.json(
      {
        version: latest.tag_name,
        publishedAt: latest.published_at,
        releaseUrl: latest.html_url,
        windows: findAsset(assets, a => lower(a).endsWith('.exe')),
        macos: findAsset(assets, a => lower(a).includes('macos') && lower(a).endsWith('.zip'))
      },
      // נתון ציבורי-לגמרי, לא תלוי-משתמש/session — ראו הערה מקבילה
      // ב-book-acronyms/export-json ו-github-releases.
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=1200' } }
    )
  } catch (error) {
    console.error('Error fetching offline-update releases:', error)
    return NextResponse.json({ error: 'Failed to fetch releases' }, { status: 500 })
  }
}

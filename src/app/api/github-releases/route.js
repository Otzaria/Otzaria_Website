import { NextResponse } from 'next/server'
import { extractPlatformDownloads, hasPlatformAssets } from '@/lib/githubReleaseAssets'

// המסלול דינמי (הוא קורא את searchParams), ולכן revalidate ברמת המסלול היה
// חסר משמעות וסתר את force-dynamic. המטמון האמיתי הוא על ה-fetch ל-GitHub למטה.
export const dynamic = 'force-dynamic'

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

    return NextResponse.json(
      {
        version: latestRelease.tag_name,
        versions: platformVersions,
        ...platformData,
        releaseUrl: latestRelease.html_url
      },
      // נתון ציבורי-לגמרי, לא תלוי-משתמש/session (מידע גרסאות GitHub) —
      // מאפשרים CDN/browser caching קצר על אף שער השבת ב-src/proxy.js
      // (פשרה מכוונת: בקשות שמוגשות ממטמון הדפדפן/CDN לא עוברות דרך ה-middleware
      // בזמן שבת/יו"ט, ראו CLAUDE.md).
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=1200' } }
    )
  } catch (error) {
    console.error('Error fetching GitHub releases:', error)
    return NextResponse.json(
      { error: 'Failed to fetch releases' },
      { status: 500 }
    )
  }
}

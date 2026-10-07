import { NextResponse } from 'next/server'
import { getAppDownloads, ReleaseNotFoundError, RELEASE_CACHE_CONTROL } from '@/lib/githubReleases'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const type = new URL(request.url).searchParams.get('type') || 'stable'
    const downloads = await getAppDownloads(type)
    // Public release data may use short CDN/browser caching (including the
    // existing Shabbat-gate tradeoff documented in CLAUDE.md).
    return NextResponse.json(downloads, { headers: { 'Cache-Control': RELEASE_CACHE_CONTROL } })
  } catch (error) {
    if (error instanceof ReleaseNotFoundError) {
      return NextResponse.json({ error: 'No release found' }, { status: 404 })
    }
    console.error('Error fetching GitHub releases:', error)
    return NextResponse.json({ error: 'Failed to fetch releases' }, { status: 500 })
  }
}

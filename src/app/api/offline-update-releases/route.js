import { NextResponse } from 'next/server'
import { getOfflineUpdateRelease, ReleaseNotFoundError, RELEASE_CACHE_CONTROL } from '@/lib/githubReleases'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const releases = await getOfflineUpdateRelease()
    return NextResponse.json(releases, { headers: { 'Cache-Control': RELEASE_CACHE_CONTROL } })
  } catch (error) {
    if (error instanceof ReleaseNotFoundError) {
      return NextResponse.json({ error: 'No release found' }, { status: 404 })
    }
    console.error('Error fetching offline-update releases:', error)
    return NextResponse.json({ error: 'Failed to fetch releases' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { shabbatGatedCacheHeaders } from '@/lib/api-cache'

// דינמי כמו /api/offline-update-releases — המטמון האמיתי הוא על ה-fetch ל-GitHub למטה.
export const dynamic = 'force-dynamic'

const REPO = 'Otzaria/otzaria-plugin-store'

/**
 * החבילה המלאה של "חנות התוספים" הנפרדת (אפליקציית Windows אחת, native, ~המראה כולה
 * בפנים). מתפרסמת תחת תג מתגלגל בשם bundle (ראו otzaria_plugin_store/README.md) ולכן
 * נשלפת בנפרד מהגרסאות הרגילות (v1, v2, וכו') של ה-exe הרזה שמסתנכרן מהרשת.
 */
export async function GET() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/bundle`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Otzaria-Website'
      },
      next: { revalidate: 600 }
    })

    if (!response.ok) throw new Error('Failed to fetch bundle release')
    const release = await response.json()

    const asset = (release.assets || []).find(a => a.name.toLowerCase().endsWith('.exe'))
    if (!asset) {
      return NextResponse.json({ error: 'No asset found' }, { status: 404 })
    }

    return NextResponse.json(
      {
        url: asset.browser_download_url,
        size: asset.size,
        name: asset.name,
        updatedAt: asset.updated_at,
        releaseUrl: release.html_url
      },
      { headers: shabbatGatedCacheHeaders() }
    )
  } catch (error) {
    console.error('Error fetching plugin-store-app release:', error)
    return NextResponse.json({ error: 'Failed to fetch release' }, { status: 500 })
  }
}

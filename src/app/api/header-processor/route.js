import { cached } from '@/lib/api-cache'

// הקובץ מתעדכן רק כשיוצאת גרסה חדשה של הכלי ב-GitHub, ולכן אין טעם להוריד
// אותו מחדש מ-GitHub בכל בקשה — נשמר בזיכרון התהליך לזמן קצר, כמו ב-stats/github-releases.
const CACHE_TTL_MS = 10 * 60_000

async function fetchHeaderProcessorHtml() {
  const response = await fetch(
    'https://github.com/Otzaria/Header-processor-and-file-splitter/releases/latest/download/index.html',
    {
      headers: {
        'User-Agent': 'Otzaria-Website'
      }
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch header processor')
  }

  return response.arrayBuffer()
}

export async function GET() {
  try {
    const buffer = await cached('header-processor-html', CACHE_TTL_MS, fetchHeaderProcessorHtml)

    // Encode Hebrew filename properly for Content-Disposition
    const filename = encodeURIComponent('מעבד כותרות ומחלק קבצים.html')

    return new Response(buffer, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        // נתון ציבורי-לגמרי, לא תלוי-משתמש/session — ראו הערה מקבילה
        // ב-book-acronyms/export-json ו-github-releases.
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=1200'
      }
    })
  } catch (error) {
    console.error('Error fetching header processor:', error)
    return new Response('Failed to download header processor', { status: 500 })
  }
}

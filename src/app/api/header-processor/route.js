export async function GET() {
  try {
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

    const buffer = await response.arrayBuffer()

    // Encode Hebrew filename properly for Content-Disposition
    const filename = encodeURIComponent('מעבד כותרות ומחלק קבצים.html')

    return new Response(buffer, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`
      }
    })
  } catch (error) {
    console.error('Error fetching header processor:', error)
    return new Response('Failed to download header processor', { status: 500 })
  }
}

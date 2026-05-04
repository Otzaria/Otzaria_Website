import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfo from '@/models/BookInfo'
import { escapeCsvValue } from '@/lib/book-info-utils'
import { hasBooksAccess } from '@/lib/roles';

function isAdmin(session) {
  return hasBooksAccess(session?.user?.role)
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!isAdmin(session)) {
      return new Response('Forbidden', { status: 403 })
    }

    await connectDB()

    const rows = await BookInfo.find({})
      .sort({ bookName: 1, authorName: 1 })
      .select('bookName authorName generationName subGenerationName startYear endYear')
      .lean()

    const header = ['bookName', 'authorName', 'generationName', 'subGenerationName', 'startYear', 'endYear']

    const lines = [header.join(',')]
    for (const row of rows) {
      lines.push(
        [
          escapeCsvValue(row.bookName),
          escapeCsvValue(row.authorName),
          escapeCsvValue(row.generationName),
          escapeCsvValue(row.subGenerationName),
          escapeCsvValue(row.startYear),
          escapeCsvValue(row.endYear)
        ].join(',')
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    return new Response(`\uFEFF${lines.join('\n')}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="books-info-approved-${today}.csv"`
      }
    })
  } catch (error) {
    console.error('GET /api/admin/book-info/export-csv failed:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

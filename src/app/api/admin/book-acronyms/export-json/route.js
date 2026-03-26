import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookAcronym from '@/models/BookAcronym'

function isAdmin(session) {
  return session?.user?.role === 'admin'
}

function normalizeBookId(externalId) {
  const asNumber = Number(externalId)
  if (Number.isFinite(asNumber) && String(asNumber) === String(externalId)) {
    return asNumber
  }
  return externalId
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!isAdmin(session)) {
      return new Response('Forbidden', { status: 403 })
    }

    await connectDB()

    const books = await BookAcronym.find({})
      .sort({ externalId: 1 })
      .select('externalId aliases')
      .lean()

    const output = []
    for (const book of books) {
      for (const term of book.aliases || []) {
        output.push({
          bookId: normalizeBookId(book.externalId),
          term
        })
      }
    }

    output.sort((a, b) => {
      if (a.bookId === b.bookId) {
        return String(a.term).localeCompare(String(b.term), 'he')
      }
      return String(a.bookId).localeCompare(String(b.bookId), 'en')
    })

    return new Response(JSON.stringify(output, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="book_acronym.json"'
      }
    })
  } catch (error) {
    console.error('GET /api/admin/book-acronyms/export-json failed:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

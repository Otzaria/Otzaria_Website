import connectDB from '@/lib/db'
import BookAcronym from '@/models/BookAcronym'

function normalizeBookId(externalId) {
  const asNumber = Number(externalId)
  if (Number.isFinite(asNumber) && String(asNumber) === String(externalId)) {
    return asNumber
  }
  return externalId
}

function normalizeAlias(term) {
  if (typeof term !== 'string') return ''
  return term.trim()
}

export async function GET() {
  try {
    await connectDB()

    const books = await BookAcronym.find({})
      .sort({ externalId: 1 })
      .select('externalId aliases')
      .lean()

    const output = books.flatMap((book) =>
      (book.aliases || [])
        .map((term) => normalizeAlias(term))
        .filter(Boolean)
        .map((term) => ({
          bookId: normalizeBookId(book.externalId),
          term
        }))
    )

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
    console.error('GET /api/book-acronyms/export-json failed:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

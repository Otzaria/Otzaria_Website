import connectDB from '@/lib/db'
import BookAcronym from '@/models/BookAcronym'
import { cached, shabbatGatedCacheHeaders } from '@/lib/api-cache'

// הרשימה המלאה משמשת יצוא/סנכרון חיצוני ואינה תלויה במשתמש, ולכן אין טעם
// לשלוף ולמיין אותה מחדש מה-DB בכל בקשה (כמו ב-stats/github-releases).
const CACHE_TTL_MS = 5 * 60_000

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

async function buildExport() {
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

  return output
}

export async function GET() {
  try {
    const output = await cached('book-acronyms-export-json', CACHE_TTL_MS, buildExport)

    return new Response(JSON.stringify(output, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="book_acronym.json"',
        // ראו הערה ב-header-processor/route.js: no-store נדרש בגלל חסימת
        // השבת, לא בגלל שהנתונים משתנים לעיתים קרובות.
        ...shabbatGatedCacheHeaders()
      }
    })
  } catch (error) {
    console.error('GET /api/book-acronyms/export-json failed:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

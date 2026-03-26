import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookAcronym from '@/models/BookAcronym'
import BookAcronymPendingSuggestion from '@/models/BookAcronymPendingSuggestion'

function requireAuthenticatedSession(session) {
  return session?.user?.id || session?.user?._id
}

function normalizeAlias(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const userId = requireAuthenticatedSession(session)
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const [books, pending] = await Promise.all([
      BookAcronym.find({}).sort({ updatedAt: 1, externalId: 1 }).lean(),
      BookAcronymPendingSuggestion.find({})
        .sort({ updatedAt: -1 })
        .lean()
    ])

    const pendingByBookId = new Map()
    for (const suggestion of pending) {
      const key = String(suggestion.bookAcronym)
      const list = pendingByBookId.get(key) || []
      list.push({
        id: String(suggestion._id),
        alias: suggestion.alias,
        updatedAt: suggestion.updatedAt
      })
      pendingByBookId.set(key, list)
    }

    const rows = books.map((book) => ({
      id: String(book._id),
      externalId: book.externalId,
      displayName: book.displayName || '',
      aliases: Array.isArray(book.aliases) ? book.aliases : [],
      pendingAliases: pendingByBookId.get(String(book._id)) || []
    }))

    return NextResponse.json({ success: true, rows })
  } catch (error) {
    console.error('GET /api/library/book-acronyms failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת הכינויים' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    const userId = requireAuthenticatedSession(session)
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { bookAcronymId, alias } = body || {}
    const normalizedAlias = normalizeAlias(alias)

    if (!bookAcronymId) {
      return NextResponse.json({ success: false, error: 'bookAcronymId is required' }, { status: 400 })
    }
    if (!normalizedAlias) {
      return NextResponse.json({ success: false, error: 'יש להזין כינוי תקין' }, { status: 400 })
    }

    await connectDB()

    const book = await BookAcronym.findById(bookAcronymId)
    if (!book) {
      return NextResponse.json({ success: false, error: 'ספר לא נמצא' }, { status: 404 })
    }

    if ((book.aliases || []).includes(normalizedAlias)) {
      return NextResponse.json({ success: false, error: 'הכינוי כבר קיים ומאושר' }, { status: 400 })
    }

    const existingPending = await BookAcronymPendingSuggestion.findOne({
      bookAcronym: book._id,
      alias: normalizedAlias
    })

    if (existingPending) {
      return NextResponse.json({ success: true, pendingId: String(existingPending._id), alreadyPending: true })
    }

    const suggestion = await BookAcronymPendingSuggestion.create({
      bookAcronym: book._id,
      alias: normalizedAlias,
      submittedBy: userId
    })

    // משאיר ספרים שלא נערכו הרבה זמן בראש הרשימה;
    // כל הצעה חדשה מעדכנת updatedAt ולכן הספר ירד לתחתית.
    book.updatedAt = new Date()
    await book.save()

    return NextResponse.json({ success: true, pendingId: String(suggestion._id) })
  } catch (error) {
    console.error('POST /api/library/book-acronyms failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בשליחת הכינוי לאישור' }, { status: 500 })
  }
}

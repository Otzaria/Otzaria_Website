import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookAcronym from '@/models/BookAcronym'
import BookAcronymPendingSuggestion from '@/models/BookAcronymPendingSuggestion'

function isAdmin(session) {
  return session?.user?.role === 'admin'
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const suggestions = await BookAcronymPendingSuggestion.find({})
      .populate('bookAcronym')
      .populate('submittedBy', 'name')
      .sort({ updatedAt: -1 })
      .lean()

    const rows = suggestions
      .filter((item) => !!item.bookAcronym)
      .map((item) => ({
        id: String(item._id),
        bookAcronymId: String(item.bookAcronym._id),
        externalId: item.bookAcronym.externalId,
        displayName: item.bookAcronym.displayName || '',
        approvedAliases: item.bookAcronym.aliases || [],
        alias: item.alias,
        submittedBy: item.submittedBy?.name || 'משתמש',
        updatedAt: item.updatedAt
      }))

    return NextResponse.json({ success: true, rows })
  } catch (error) {
    console.error('GET /api/admin/book-acronyms/pending failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת ההצעות' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { action, suggestionIds } = body || {}

    if (!['approve', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, error: 'פעולה לא תקינה' }, { status: 400 })
    }
    if (!Array.isArray(suggestionIds) || suggestionIds.length === 0) {
      return NextResponse.json({ success: false, error: 'לא נבחרו פריטים' }, { status: 400 })
    }

    await connectDB()

    let processed = 0
    for (const suggestionId of suggestionIds) {
      const suggestion = await BookAcronymPendingSuggestion.findById(suggestionId)
      if (!suggestion) continue

      if (action === 'approve') {
        await BookAcronym.findByIdAndUpdate(suggestion.bookAcronym, {
          $addToSet: { aliases: suggestion.alias }
        })
      }

      await BookAcronymPendingSuggestion.findByIdAndDelete(suggestion._id)
      processed += 1
    }

    return NextResponse.json({ success: true, processed })
  } catch (error) {
    console.error('POST /api/admin/book-acronyms/pending failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בעדכון ההצעות' }, { status: 500 })
  }
}

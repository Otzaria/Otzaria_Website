import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfoChangeSet from '@/models/BookInfoChangeSet'
import { BOOK_INFO_GENERATION_OPTIONS, BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION } from '@/lib/book-info-constants'
import { rowKey } from '@/lib/bookinfo/csv'
import { BookInfoInputError, getBookInfoSnapshot, listOpenEdits, submitEdit } from '@/lib/bookinfo/service'
import { unauthorized, badRequest, serverError } from '@/lib/apiResponse'

export const maxDuration = 120

const MAX_OPEN_PER_USER = 20
const MIN_SECONDS_BETWEEN_SUBMISSIONS = 10

function requireAuthenticatedSession(session) {
  return session?.user?.id || session?.user?._id
}

// הנתונים נקראים מ-ForDB/book_info.csv בריפו Otzaria/otzaria-library, וכל עריכה נשלחת אליו כ-PR.
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!requireAuthenticatedSession(session)) return unauthorized()

    await connectDB()
    const [snapshot, pendingEdits] = await Promise.all([getBookInfoSnapshot(), listOpenEdits()])
    const pendingByKey = new Map(pendingEdits.map((p) => [p.bookKey, p]))

    const rows = snapshot.rows.map((approved) => {
      const key = rowKey(approved.bookName, approved.authorName)
      const pending = pendingByKey.get(key)
      return {
        id: key,
        approved,
        effective: pending ? { ...approved, ...pending.changes } : approved,
        pending: pending ? { id: pending.id, changedFields: Object.keys(pending.changes), prNumber: pending.prNumber, prUrl: pending.prUrl } : null,
      }
    })

    return NextResponse.json(
      {
        success: true,
        rows,
        generationOptions: BOOK_INFO_GENERATION_OPTIONS,
        subGenerationOptionsByGeneration: BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    console.error('GET /api/library/book-info failed:', error)
    return serverError('שגיאה בטעינת מידע הספרים')
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    const userId = requireAuthenticatedSession(session)
    if (!userId) return unauthorized()

    const body = await request.json().catch(() => null)
    const { book, author, updates } = body || {}
    if (!book || typeof updates !== 'object' || !updates) return badRequest('יש לשלוח ספר ועדכונים')

    await connectDB()
    const [openCount, last] = await Promise.all([
      BookInfoChangeSet.countDocuments({ submittedBy: userId, status: { $in: ['publishing', 'open'] } }),
      BookInfoChangeSet.findOne({ submittedBy: userId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    ])
    if (openCount >= MAX_OPEN_PER_USER) {
      return NextResponse.json({ success: false, error: `יש לך כבר ${openCount} בקשות פתוחות; נא להמתין לבדיקתן` }, { status: 429 })
    }
    if (last && Date.now() - new Date(last.createdAt).getTime() < MIN_SECONDS_BETWEEN_SUBMISSIONS * 1000) {
      return NextResponse.json({ success: false, error: 'נשלחה בקשה לפני רגע; נא לנסות שוב בעוד כמה שניות' }, { status: 429 })
    }

    const result = await submitEdit({ edit: { book, author: author || '', updates }, userId })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof BookInfoInputError) return badRequest(error.message)
    console.error('POST /api/library/book-info failed:', error)
    return serverError('שגיאה בפתיחת הבקשה לעדכון מידע הספר')
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfo from '@/models/BookInfo'
import BookInfoPendingChange from '@/models/BookInfoPendingChange'
import {
  BOOK_INFO_GENERATION_OPTIONS,
  BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION
} from '@/lib/book-info-constants'
import {
  buildDiff,
  getChangedFields,
  mergeBookInfoWithPending,
  normalizeBookInfoUpdates
} from '@/lib/book-info-utils'

function requireAuthenticatedSession(session) {
  return session?.user?.id || session?.user?._id
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const userId = requireAuthenticatedSession(session)
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const [approvedRows, pendingRows] = await Promise.all([
      BookInfo.find({}).sort({ bookName: 1, authorName: 1 }).lean(),
      BookInfoPendingChange.find({})
        .populate('submittedBy', 'name')
        .sort({ updatedAt: -1 })
        .lean()
    ])

    const pendingByBookId = new Map(pendingRows.map((row) => [String(row.bookInfo), row]))

    const rows = approvedRows.map((approved) => {
      const pending = pendingByBookId.get(String(approved._id))
      const effective = mergeBookInfoWithPending(approved, pending)
      return {
        id: String(approved._id),
        approved,
        effective,
        pending: pending
          ? {
              id: String(pending._id),
              changedFields: getChangedFields(pending.changes),
              submittedBy: pending.submittedBy?.name || 'משתמש',
              updatedAt: pending.updatedAt
            }
          : null
      }
    })

    return NextResponse.json({
      success: true,
      rows,
      generationOptions: BOOK_INFO_GENERATION_OPTIONS,
      subGenerationOptionsByGeneration: BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION
    })
  } catch (error) {
    console.error('GET /api/library/book-info failed:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה בטעינת מידע הספרים' },
      { status: 500 }
    )
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
    const { bookInfoId, updates: rawUpdates } = body || {}

    if (!bookInfoId) {
      return NextResponse.json({ success: false, error: 'bookInfoId is required' }, { status: 400 })
    }

    const { updates, errors } = normalizeBookInfoUpdates(rawUpdates || {})
    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors[0] }, { status: 400 })
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'לא נשלחו שדות לעדכון' }, { status: 400 })
    }

    await connectDB()

    const approved = await BookInfo.findById(bookInfoId)
    if (!approved) {
      return NextResponse.json({ success: false, error: 'רשומת ספר לא נמצאה' }, { status: 404 })
    }

    const diff = buildDiff(approved.toObject(), updates)
    if (Object.keys(diff).length === 0) {
      await BookInfoPendingChange.findOneAndDelete({ bookInfo: approved._id })
      return NextResponse.json({
        success: true,
        message: 'אין שינויים מול הנתון המאושר',
        pendingCleared: true
      })
    }

    const pending = await BookInfoPendingChange.findOneAndUpdate(
      { bookInfo: approved._id },
      {
        $set: {
          submittedBy: userId,
          changes: diff
        }
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({
      success: true,
      pendingId: String(pending._id),
      changedFields: getChangedFields(diff)
    })
  } catch (error) {
    console.error('POST /api/library/book-info failed:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה בשליחת העדכון לאישור מנהל' },
      { status: 500 }
    )
  }
}

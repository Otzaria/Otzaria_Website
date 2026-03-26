import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfo from '@/models/BookInfo'
import BookInfoPendingChange from '@/models/BookInfoPendingChange'
import { BOOK_INFO_EDITABLE_FIELDS } from '@/lib/book-info-constants'
import { getChangedFields } from '@/lib/book-info-utils'

function isAdmin(session) {
  return session?.user?.role === 'admin'
}

function normalizeFieldSelection(changeDoc, fields) {
  const availableFields = getChangedFields(changeDoc.changes)
  if (!Array.isArray(fields) || fields.length === 0) {
    return availableFields
  }
  return fields.filter((field) => BOOK_INFO_EDITABLE_FIELDS.includes(field) && availableFields.includes(field))
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const pendingRows = await BookInfoPendingChange.find({})
      .populate('bookInfo')
      .populate('submittedBy', 'name')
      .sort({ updatedAt: -1 })
      .lean()

    const rows = pendingRows
      .filter((row) => !!row.bookInfo)
      .map((row) => {
        const changedFields = getChangedFields(row.changes)
        return {
          id: String(row._id),
          bookInfoId: String(row.bookInfo._id),
          submittedBy: row.submittedBy?.name || 'משתמש',
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          approved: row.bookInfo,
          changes: row.changes,
          changedFields
        }
      })

    return NextResponse.json({ success: true, rows })
  } catch (error) {
    console.error('GET /api/admin/book-info/pending failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת שינויים ממתינים' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { action, selections } = body || {}

    if (!['approve', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, error: 'פעולה לא תקינה' }, { status: 400 })
    }
    if (!Array.isArray(selections) || selections.length === 0) {
      return NextResponse.json({ success: false, error: 'לא נבחרו שדות לטיפול' }, { status: 400 })
    }

    await connectDB()

    const changedRows = []
    for (const selection of selections) {
      const { changeId } = selection || {}
      if (!changeId) {
        continue
      }

      const changeDoc = await BookInfoPendingChange.findById(changeId)
      if (!changeDoc) {
        continue
      }

      const selectedFields = normalizeFieldSelection(changeDoc, selection.fields)
      if (selectedFields.length === 0) {
        continue
      }

      const book = await BookInfo.findById(changeDoc.bookInfo)
      if (!book) {
        await BookInfoPendingChange.findByIdAndDelete(changeDoc._id)
        continue
      }

      if (action === 'approve') {
        for (const field of selectedFields) {
          book[field] = changeDoc.get(`changes.${field}`)
          changeDoc.set(`changes.${field}`, undefined)
        }
        await book.save()
      }

      if (action === 'delete') {
        for (const field of selectedFields) {
          changeDoc.set(`changes.${field}`, undefined)
        }
      }

      const remainingFields = getChangedFields(changeDoc.changes)
      if (remainingFields.length === 0) {
        await BookInfoPendingChange.findByIdAndDelete(changeDoc._id)
      } else {
        changeDoc.markModified('changes')
        await changeDoc.save()
      }

      changedRows.push(String(changeDoc._id))
    }

    return NextResponse.json({ success: true, processed: changedRows.length })
  } catch (error) {
    console.error('POST /api/admin/book-info/pending failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בעדכון השינויים הממתינים' }, { status: 500 })
  }
}



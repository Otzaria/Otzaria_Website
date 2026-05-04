import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfo from '@/models/BookInfo'
import BookInfoPendingChange from '@/models/BookInfoPendingChange'
import { BOOK_INFO_EDITABLE_FIELDS } from '@/lib/book-info-constants'
import { getChangedFields } from '@/lib/book-info-utils'
import { hasBooksAccess } from '@/lib/roles';

function isAdmin(session) {
  return hasBooksAccess(session?.user?.role)
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

    const requestedChangeIds = selections
      .map((selection) => selection?.changeId)
      .filter(Boolean)

    const pendingChanges = await BookInfoPendingChange.find({
      _id: { $in: requestedChangeIds }
    })
      .select('_id bookInfo changes')
      .lean()

    const changeById = new Map(
      pendingChanges.map((changeDoc) => [String(changeDoc._id), changeDoc])
    )

    const bookIds = Array.from(
      new Set(pendingChanges.map((changeDoc) => String(changeDoc.bookInfo)))
    )

    const existingBooks = await BookInfo.find({ _id: { $in: bookIds } })
      .select('_id')
      .lean()

    const existingBookIdSet = new Set(existingBooks.map((book) => String(book._id)))

    const bookUpdateById = new Map()
    const pendingUpdateById = new Map()
    const pendingDeleteIds = new Set()
    const changedRows = []

    for (const selection of selections) {
      const { changeId } = selection || {}
      if (!changeId) {
        continue
      }

      const changeDoc = changeById.get(String(changeId))
      if (!changeDoc) {
        continue
      }

      const selectedFields = normalizeFieldSelection(changeDoc, selection.fields)
      if (selectedFields.length === 0) {
        continue
      }

      const bookId = String(changeDoc.bookInfo)
      if (!existingBookIdSet.has(bookId)) {
        pendingDeleteIds.add(String(changeDoc._id))
        pendingUpdateById.delete(String(changeDoc._id))
        changeById.delete(String(changeDoc._id))
        continue
      }

      if (action === 'approve') {
        if (!bookUpdateById.has(bookId)) {
          bookUpdateById.set(bookId, {})
        }
        const bookUpdate = bookUpdateById.get(bookId)

        for (const field of selectedFields) {
          bookUpdate[field] = changeDoc.changes?.[field]
          if (changeDoc.changes) {
            delete changeDoc.changes[field]
          }
        }
      }

      if (action === 'delete') {
        for (const field of selectedFields) {
          if (changeDoc.changes) {
            delete changeDoc.changes[field]
          }
        }
      }

      const remainingFields = getChangedFields(changeDoc.changes)
      if (remainingFields.length === 0) {
        pendingDeleteIds.add(String(changeDoc._id))
        pendingUpdateById.delete(String(changeDoc._id))
        changeById.delete(String(changeDoc._id))
      } else {
        const nextChanges = {}
        for (const field of remainingFields) {
          nextChanges[field] = changeDoc.changes[field]
        }
        pendingUpdateById.set(String(changeDoc._id), nextChanges)
      }

      changedRows.push(String(changeDoc._id))
    }

    if (bookUpdateById.size > 0) {
      const bookBulkOps = Array.from(bookUpdateById.entries()).map(([bookId, updateFields]) => ({
        updateOne: {
          filter: { _id: bookId },
          update: { $set: updateFields }
        }
      }))
      await BookInfo.bulkWrite(bookBulkOps)
    }

    if (pendingDeleteIds.size > 0 || pendingUpdateById.size > 0) {
      const pendingBulkOps = []

      for (const changeDocId of pendingDeleteIds) {
        pendingBulkOps.push({
          deleteOne: {
            filter: { _id: changeDocId }
          }
        })
      }

      for (const [changeDocId, nextChanges] of pendingUpdateById.entries()) {
        if (pendingDeleteIds.has(changeDocId)) {
          continue
        }
        pendingBulkOps.push({
          updateOne: {
            filter: { _id: changeDocId },
            update: { $set: { changes: nextChanges } }
          }
        })
      }

      if (pendingBulkOps.length > 0) {
        await BookInfoPendingChange.bulkWrite(pendingBulkOps)
      }
    }

    return NextResponse.json({ success: true, processed: changedRows.length })
  } catch (error) {
    console.error('POST /api/admin/book-info/pending failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בעדכון השינויים הממתינים' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfo from '@/models/BookInfo'
import BookInfoPendingChange from '@/models/BookInfoPendingChange'
import { BOOK_INFO_EDITABLE_FIELDS } from '@/lib/book-info-constants'
import { getChangedFields } from '@/lib/book-info-utils'
import { hasBooksAccess } from '@/lib/roles';
import { BookInfoInputError, resolveLegacyEdit, submitEdit } from '@/lib/bookinfo/service'

// העברת הצעה ל-PR פותחת אותו ב-GitHub; הדף שולח הצעה אחת בכל בקשה
export const maxDuration = 120

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

    if (!['publish', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, error: 'פעולה לא תקינה' }, { status: 400 })
    }
    if (!Array.isArray(selections) || selections.length === 0) {
      return NextResponse.json({ success: false, error: 'לא נבחרו שדות לטיפול' }, { status: 400 })
    }

    await connectDB()

    if (action === 'publish') {
      if (selections.length !== 1) {
        return NextResponse.json({ success: false, error: 'יש להעביר הצעה אחת בכל פעם' }, { status: 400 })
      }
      return publishAsPullRequest(selections[0], session.user.id || session.user._id)
    }

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

      // אישור ל-Mongo כבר אינו קיים: מקור האמת הוא הקובץ בריפו, ולכן כאן נשארת רק מחיקה
      for (const field of selectedFields) {
        if (changeDoc.changes) {
          delete changeDoc.changes[field]
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

/**
 * הצעה מהתור הישן (לפני שהעריכות עברו ל-PR) נפתחת כ-PR לריפו הספרייה, בשם מי שהציע אותה.
 * השדות שהועברו יוצאים מההצעה, וההצעה נמחקת כשלא נשארו בה שדות.
 */
async function publishAsPullRequest(selection, adminId) {
  const changeDoc = await BookInfoPendingChange.findById(selection?.changeId)
    .populate('bookInfo')
    .lean()
  if (!changeDoc) {
    return NextResponse.json({ success: false, error: 'ההצעה לא נמצאה' }, { status: 404 })
  }
  if (!changeDoc.bookInfo) {
    await BookInfoPendingChange.deleteOne({ _id: changeDoc._id })
    return NextResponse.json({ success: false, error: 'הספר של ההצעה כבר אינו קיים, וההצעה נמחקה' }, { status: 400 })
  }

  const fields = normalizeFieldSelection(changeDoc, selection.fields)
  if (fields.length === 0) {
    return NextResponse.json({ success: false, error: 'לא נבחרו שדות לטיפול' }, { status: 400 })
  }

  try {
    const resolved = await resolveLegacyEdit(changeDoc)
    const expected = changeDoc.expectedCsvRow || changeDoc.bookInfo
    for (const field of fields) {
      const current = resolved.row[field] ?? null
      if (field !== 'bookName' && current !== (expected[field] ?? null) && current !== (changeDoc.changes[field] ?? null)) throw new BookInfoInputError(`הנתון בקובץ השתנה מאז ההצעה: ${field}; ההצעה נשמרה לבדיקה`)
    }
    // Save provenance before publication, even if a response is lost.
    await BookInfoPendingChange.updateOne({ _id: changeDoc._id }, { $set: { csvIdentity: resolved.identity, identityRevision: resolved.identityRevision, expectedCsvRow: resolved.row } })
    const result = await submitEdit({
      edit: {
        book: resolved.identity.bookName,
        author: resolved.identity.authorName,
        baseRow: resolved.row,
        identityRevision: resolved.identityRevision,
        updates: Object.fromEntries(fields.map((field) => [field, changeDoc.changes[field]]))
      },
      userId: changeDoc.submittedBy || adminId
    })

    const remaining = Object.fromEntries(Object.entries(changeDoc.changes || {}).filter(([field]) => !fields.includes(field)))
    if (getChangedFields(remaining).length === 0) {
      await BookInfoPendingChange.deleteOne({ _id: changeDoc._id })
    } else {
      await BookInfoPendingChange.updateOne({ _id: changeDoc._id }, { $set: { changes: remaining, csvIdentity: resolved.identity, identityRevision: resolved.identityRevision, expectedCsvRow: resolved.row, lastPublishedChangeSetId: result.id } })
    }
    return NextResponse.json({ success: true, processed: 1, prNumber: result.prNumber, prUrl: result.prUrl })
  } catch (error) {
    if (error instanceof BookInfoInputError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    throw error
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookAcronym from '@/models/BookAcronym'
import BookAcronymPendingSuggestion from '@/models/BookAcronymPendingSuggestion'

function isAdmin(session) {
  return session?.user?.role === 'admin'
}

function buildAtomicAliasReplaceUpdate(currentAlias, nextAlias) {
  return [
    {
      $set: {
        aliases: {
          $reduce: {
            input: {
              $map: {
                input: { $ifNull: ['$aliases', []] },
                as: 'alias',
                in: {
                  $cond: [
                    { $eq: ['$$alias', currentAlias] },
                    nextAlias,
                    '$$alias'
                  ]
                }
              }
            },
            initialValue: [],
            in: {
              $cond: [
                { $in: ['$$this', '$$value'] },
                '$$value',
                { $concatArrays: ['$$value', ['$$this']] }
              ]
            }
          }
        }
      }
    }
  ]
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

    const rows = suggestions.map((item) => ({
        id: String(item._id),
        bookAcronymId: item.bookAcronym?._id ? String(item.bookAcronym._id) : '',
        externalId: item.bookAcronym?.externalId || item.bookExternalId || '',
        displayName: item.bookAcronym?.displayName || item.bookDisplayName || '',
        approvedAliases: item.bookAcronym?.aliases || item.approvedAliasesSnapshot || [],
        actionType: item.actionType || 'add',
        currentAlias: item.currentAlias || null,
        nextAlias: item.nextAlias || item.alias || null,
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

    const suggestions = await BookAcronymPendingSuggestion.find({
      _id: { $in: suggestionIds }
    })
      .select('_id bookAcronym actionType currentAlias nextAlias alias')
      .lean()

    if (action === 'approve' && suggestions.length > 0) {
      const bookOps = []
      for (const suggestion of suggestions) {
        const bookId = String(suggestion.bookAcronym)
        const actionType = suggestion.actionType || 'add'
        const currentAlias = suggestion.currentAlias || null
        const nextAlias = suggestion.nextAlias || suggestion.alias || null

        if (actionType === 'add' && nextAlias) {
          bookOps.push({
            updateOne: {
              filter: { _id: bookId },
              update: { $addToSet: { aliases: nextAlias } }
            }
          })
        } else if (actionType === 'delete' && currentAlias) {
          bookOps.push({
            updateOne: {
              filter: { _id: bookId },
              update: { $pull: { aliases: currentAlias } }
            }
          })
        } else if (actionType === 'update' && currentAlias && nextAlias) {
          bookOps.push({
            updateOne: {
              filter: { _id: bookId },
              update: buildAtomicAliasReplaceUpdate(currentAlias, nextAlias)
            }
          })
        }
      }

      if (bookOps.length > 0) {
        await BookAcronym.bulkWrite(bookOps)
      }
    }

    const processedSuggestionIds = suggestions.map((suggestion) => suggestion._id)
    if (processedSuggestionIds.length > 0) {
      await BookAcronymPendingSuggestion.deleteMany({
        _id: { $in: processedSuggestionIds }
      })
    }

    const processed = processedSuggestionIds.length
    return NextResponse.json({ success: true, processed })
  } catch (error) {
    console.error('POST /api/admin/book-acronyms/pending failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בעדכון ההצעות' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasBooksAccess } from '@/lib/roles'
import BookAcronym from '@/models/BookAcronym'
import BookAcronymPendingSuggestion from '@/models/BookAcronymPendingSuggestion'

function requireAdminAccess(session) {
  return hasBooksAccess(session?.user?.role)
}

function normalizeAlias(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isSameAlias(a, b) {
  return normalizeAlias(a) === normalizeAlias(b)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractPendingTargetAlias(suggestion) {
  if (!suggestion) return ''
  if (suggestion.actionType === 'update') return normalizeAlias(suggestion.nextAlias)
  if (suggestion.actionType === 'add') return normalizeAlias(suggestion.nextAlias || suggestion.alias)
  return ''
}

function buildWholeWordSearchPattern(searchText) {
  const normalizedSearchText = normalizeAlias(searchText)
  if (!normalizedSearchText) return null

  return `(^|[^\\p{L}\\p{N}])${escapeRegex(normalizedSearchText)}(?=$|[^\\p{L}\\p{N}])`
}
function replaceWholeWordOccurrences(text, searchText, replacementText) {
  const normalizedText = normalizeAlias(text)
  const normalizedSearchText = normalizeAlias(searchText)
  const normalizedReplacementText = normalizeAlias(replacementText)

  if (!normalizedText || !normalizedSearchText || !normalizedReplacementText) {
    return null
  }

  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(normalizedSearchText)})(?=$|[^\\p{L}\\p{N}])`, 'gu')
  if (!pattern.test(normalizedText)) {
    return null
  }

  return normalizeAlias(normalizedText.replace(pattern, `$1${normalizedReplacementText}`))
}
async function createBulkAliasSuggestions({ userId, matchText, replacementText }) {
  const normalizedMatchText = normalizeAlias(matchText)
  const normalizedReplacementText = normalizeAlias(replacementText)

  if (!normalizedMatchText || !normalizedReplacementText) {
    return {
      error: 'יש למלא גם טקסט לחיפוש בשם הספר וגם את הכינוי החלופי'
    }
  }

  if (isSameAlias(normalizedMatchText, normalizedReplacementText)) {
    return {
      error: 'הכינוי החלופי חייב להיות שונה מהטקסט שמחפשים בשם הספר'
    }
  }

  const wholeWordSearchPattern = buildWholeWordSearchPattern(normalizedMatchText)

  const matchingBooks = await BookAcronym.find({
    displayName: { $regex: wholeWordSearchPattern, $options: 'u' }
  })
    .sort({ updatedAt: 1, externalId: 1 })
    .lean()

  if (matchingBooks.length === 0) {
    return {
      createdCount: 0,
      matchedCount: 0,
      skippedCount: 0,
      updatedBookCount: 0
    }
  }

  const bookIds = matchingBooks.map((book) => book._id)
  const existingPendingSuggestions = await BookAcronymPendingSuggestion.find({
    bookAcronym: { $in: bookIds }
  })
    .select('bookAcronym actionType alias nextAlias')
    .lean()

  const pendingByBookId = new Map()
  for (const suggestion of existingPendingSuggestions) {
    const key = String(suggestion.bookAcronym)
    const list = pendingByBookId.get(key) || []
    list.push(suggestion)
    pendingByBookId.set(key, list)
  }

  const suggestionsToCreate = []
  const touchedBookIds = []
  let skippedCount = 0

  for (const book of matchingBooks) {
    const displayName = normalizeAlias(book.displayName)
    if (!displayName.includes(normalizedMatchText)) {
      skippedCount += 1
      continue
    }

    const nextAlias = replaceWholeWordOccurrences(displayName, normalizedMatchText, normalizedReplacementText)
    if (!nextAlias) {
      skippedCount += 1
      continue
    }

    const approvedAliases = Array.isArray(book.aliases) ? book.aliases : []
    if (approvedAliases.some((item) => isSameAlias(item, nextAlias))) {
      skippedCount += 1
      continue
    }

    const pendingSuggestions = pendingByBookId.get(String(book._id)) || []
    const alreadyPending = pendingSuggestions.some((item) => isSameAlias(extractPendingTargetAlias(item), nextAlias))
    if (alreadyPending) {
      skippedCount += 1
      continue
    }

    suggestionsToCreate.push({
      bookAcronym: book._id,
      alias: nextAlias,
      actionType: 'add',
      currentAlias: null,
      nextAlias,
      bookExternalId: String(book.externalId || ''),
      bookDisplayName: displayName,
      approvedAliasesSnapshot: approvedAliases,
      submittedBy: userId
    })
    touchedBookIds.push(book._id)
  }

  if (suggestionsToCreate.length > 0) {
    await BookAcronymPendingSuggestion.insertMany(suggestionsToCreate, { ordered: false })

    await BookAcronym.bulkWrite(
      touchedBookIds.map((bookId) => ({
        updateOne: {
          filter: { _id: bookId },
          update: { $set: { updatedAt: new Date() } }
        }
      }))
    )
  }

  return {
    createdCount: suggestionsToCreate.length,
    matchedCount: matchingBooks.length,
    skippedCount,
    updatedBookCount: touchedBookIds.length
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!requireAdminAccess(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
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
        actionType: suggestion.actionType || 'add',
        currentAlias: suggestion.currentAlias || null,
        nextAlias: suggestion.nextAlias || suggestion.alias || null,
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
    if (!requireAdminAccess(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { bookAcronymId, pendingId, actionType = 'add', alias, nextAlias, matchText, replacementText } = body || {}
    const normalizedAlias = normalizeAlias(alias)
    const normalizedNextAlias = normalizeAlias(nextAlias)

    await connectDB()

    if (actionType === 'bulk-add-by-name-pattern') {
      const result = await createBulkAliasSuggestions({
        userId,
        matchText,
        replacementText
      })

      if (result.error) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, ...result })
    }

    if (!bookAcronymId) {
      return NextResponse.json({ success: false, error: 'bookAcronymId is required' }, { status: 400 })
    }
    if (!['add', 'update', 'delete'].includes(actionType)) {
      return NextResponse.json({ success: false, error: 'סוג פעולה לא תקין' }, { status: 400 })
    }

    const book = await BookAcronym.findById(bookAcronymId)
    if (!book) {
      return NextResponse.json({ success: false, error: 'ספר לא נמצא' }, { status: 404 })
    }

    const pendingSuggestion = pendingId
      ? await BookAcronymPendingSuggestion.findById(pendingId)
      : null

    if (pendingId && !pendingSuggestion) {
      return NextResponse.json({ success: false, error: 'ההצעה הממתינה לא נמצאה' }, { status: 404 })
    }
    if (pendingSuggestion && String(pendingSuggestion.bookAcronym) !== String(book._id)) {
      return NextResponse.json({ success: false, error: 'ההצעה לא שייכת לספר שנבחר' }, { status: 400 })
    }

    const approvedAliases = Array.isArray(book.aliases) ? book.aliases : []
    const effectiveActionType = pendingSuggestion?.actionType || actionType
    let currentAlias = null
    let targetAlias = null

    if (effectiveActionType === 'add') {
      if (!normalizedAlias) {
        return NextResponse.json({ success: false, error: 'יש להזין כינוי חדש' }, { status: 400 })
      }
      if (approvedAliases.some((item) => isSameAlias(item, normalizedAlias))) {
        return NextResponse.json({ success: false, error: 'הכינוי כבר קיים ומאושר' }, { status: 400 })
      }
      targetAlias = normalizedAlias
    } else if (effectiveActionType === 'delete') {
      if (!normalizedAlias) {
        return NextResponse.json({ success: false, error: 'יש לבחור כינוי למחיקה' }, { status: 400 })
      }
      const existing = approvedAliases.find((item) => isSameAlias(item, normalizedAlias))
      if (!existing) {
        return NextResponse.json({ success: false, error: 'הכינוי לא קיים ברשימה המאושרת' }, { status: 400 })
      }
      currentAlias = existing
    } else if (effectiveActionType === 'update') {
      if (!normalizedAlias || !normalizedNextAlias) {
        return NextResponse.json({ success: false, error: 'יש לבחור כינוי ישן ולמלא כינוי חדש' }, { status: 400 })
      }
      if (isSameAlias(normalizedAlias, normalizedNextAlias)) {
        return NextResponse.json({ success: false, error: 'הכינוי החדש זהה לכינוי הישן' }, { status: 400 })
      }
      const existing = approvedAliases.find((item) => isSameAlias(item, normalizedAlias))
      if (!existing) {
        return NextResponse.json({ success: false, error: 'הכינוי הישן לא קיים ברשימה המאושרת' }, { status: 400 })
      }
      if (approvedAliases.some((item) => isSameAlias(item, normalizedNextAlias))) {
        return NextResponse.json({ success: false, error: 'הכינוי החדש כבר קיים ברשימה המאושרת' }, { status: 400 })
      }
      currentAlias = existing
      targetAlias = normalizedNextAlias
    }

    const existingPending = await BookAcronymPendingSuggestion.findOne({
      bookAcronym: book._id,
      actionType: effectiveActionType,
      currentAlias,
      nextAlias: targetAlias
    })

    if (existingPending && String(existingPending._id) !== String(pendingSuggestion?._id || '')) {
      return NextResponse.json({ success: true, pendingId: String(existingPending._id), alreadyPending: true })
    }

    let suggestion
    if (pendingSuggestion) {
      pendingSuggestion.alias = targetAlias || currentAlias
      pendingSuggestion.actionType = effectiveActionType
      pendingSuggestion.currentAlias = currentAlias
      pendingSuggestion.nextAlias = targetAlias
      pendingSuggestion.bookExternalId = String(book.externalId || '')
      pendingSuggestion.bookDisplayName = book.displayName || ''
      pendingSuggestion.approvedAliasesSnapshot = approvedAliases
      pendingSuggestion.submittedBy = userId
      suggestion = await pendingSuggestion.save()
    } else {
      suggestion = await BookAcronymPendingSuggestion.create({
        bookAcronym: book._id,
        alias: targetAlias || currentAlias,
        actionType: effectiveActionType,
        currentAlias,
        nextAlias: targetAlias,
        bookExternalId: String(book.externalId || ''),
        bookDisplayName: book.displayName || '',
        approvedAliasesSnapshot: approvedAliases,
        submittedBy: userId
      })
    }

    book.updatedAt = new Date()
    await book.save()

    return NextResponse.json({ success: true, pendingId: String(suggestion._id) })
  } catch (error) {
    console.error('POST /api/library/book-acronyms failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאה בשליחת הכינוי לאישור' }, { status: 500 })
  }
}





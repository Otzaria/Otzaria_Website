import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Types } from 'mongoose'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import { hasBooksAccess } from '@/lib/roles'
import { formatPageRecord, PAGE_METADATA } from '@/lib/adminPagesScreen/pageRecords'
import { DAY_MS } from '@/lib/adminPagesScreen/pageTerms'
import { isUserId, parsePagesQuery, PAGES_PER_PAGE } from '@/lib/adminPagesScreen/pagesQuery'
import Page from '@/models/Page'
import Book from '@/models/Book'
import User from '@/models/User'

const SELECTION_LIMIT = 500
const project = Object.fromEntries(PAGE_METADATA.split(' ').map((field) => [field, 1]))
const collation = { locale: 'he' }

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!hasBooksAccess(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const params = new URL(request.url).searchParams
    const legacy = !params.has('view')
    if (legacy && params.has('userId')) params.set('user', params.get('userId'))
    const { status, book, user, stale, sort, page } = parsePagesQuery(params)
    const limit = legacy ? Math.min(10000, Math.max(1, Number.parseInt(params.get('limit'), 10) || 5000)) : PAGES_PER_PAGE
    const selection = params.get('view') === 'selection'
    const locate = params.get('number')
    const after = params.get('after')
    if (after && !isUserId(after)) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
    await connectDB()

    const match = {}
    if (status) match.status = status
    if (user) match.claimedBy = new Types.ObjectId(user)
    if (stale) match.$or = [{ updatedAt: null }, { updatedAt: { $lte: new Date(Date.now() - stale * DAY_MS) } }]
    if (book) {
      const found = await Book.findOne({ name: book }).select('_id').lean()
      if (!found) {
        if (selection) return NextResponse.json({ pages: [], next: null })
        if (locate !== null) return NextResponse.json({ target: null })
        return NextResponse.json({ success: true, pages: [], pagination: { page, limit, total: 0, totalPages: 0 } })
      }
      match.book = found._id
    }

    if (selection) {
      if (after) match._id = { $gt: new Types.ObjectId(after) }
      const rows = await Page.find(match).select(PAGE_METADATA).sort({ _id: 1 }).limit(SELECTION_LIMIT + 1).lean()
      const batch = rows.slice(0, SELECTION_LIMIT)
      const books = await Book.find({ _id: { $in: batch.map((row) => row.book) } }).select('name').lean()
      const names = new Map(books.map((item) => [String(item._id), item.name]))
      return NextResponse.json({
        pages: batch.filter((row) => names.has(String(row.book))).map((row) => formatPageRecord(row, names.get(String(row.book)))),
        next: rows.length > SELECTION_LIMIT ? String(batch.at(-1)._id) : null,
      })
    }

    if (locate !== null) {
      const number = Number(locate)
      if (!book || !Number.isSafeInteger(number) || number < 1) return NextResponse.json({ target: null })
      const found = await Page.findOne({ ...match, pageNumber: number }).select('pageNumber updatedAt').lean()
      if (!found) return NextResponse.json({ target: null })

      const earlierNumber = { pageNumber: { $lt: found.pageNumber } }
      const date = found.updatedAt ?? null
      const preceding = sort === 'book' ? [earlierNumber] : [{ updatedAt: date, ...earlierNumber }]
      if (sort === 'oldest' && date) preceding.push({ updatedAt: null }, { updatedAt: { $lt: date } })
      if (sort === 'newest') preceding.push(date ? { updatedAt: { $gt: date } } : { updatedAt: { $type: 'date' } })
      const before = await Page.countDocuments({ $and: [match, { $or: preceding }] })
      return NextResponse.json({ target: { id: String(found._id), page: Math.floor(before / limit) + 1 } })
    }

    const ordering = {
      ...(sort !== 'book' && { updatedAt: sort === 'oldest' ? 1 : -1 }),
      [legacy ? 'book' : 'bookName']: 1,
      pageNumber: 1,
      _id: 1,
    }
    const pipeline = [
      { $match: match },
      { $project: project },
      ...(book ? [{ $set: { bookName: { $literal: book } } }] : [
        { $lookup: { from: Book.collection.name, localField: 'book', foreignField: '_id', pipeline: [{ $project: { name: 1 } }], as: 'bookInfo' } },
        { $unwind: '$bookInfo' },
        { $set: { bookName: '$bookInfo.name' } },
      ]),
    ]
    const [result] = await Page.aggregate([
      ...pipeline,
      { $facet: {
        count: [{ $count: 'total' }],
        rows: [{ $sort: ordering }, { $skip: Math.min(Number.MAX_SAFE_INTEGER, (page - 1) * limit) }, { $limit: limit }],
      } },
    ]).collation(collation).allowDiskUse(true)
    const total = result?.count[0]?.total ?? 0
    const rows = result?.rows ?? []
    const workers = await User.find({ _id: { $in: rows.flatMap((row) => row.claimedBy ? [row.claimedBy] : []) } }).select('name').lean()
    const names = new Map(workers.map((item) => [String(item._id), item.name]))
    return NextResponse.json({
      success: true,
      pages: rows.map((row) => formatPageRecord(row, row.bookName, names.get(String(row.claimedBy)))),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Admin pages list error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

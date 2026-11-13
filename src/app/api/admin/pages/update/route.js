import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import { hasBooksAccess } from '@/lib/roles'
import { isUserId } from '@/lib/adminPagesScreen/pagesQuery'
import { PAGE_STATUSES } from '@/lib/adminPagesScreen/pageTerms'
import { formatPageRecord, PAGE_METADATA } from '@/lib/adminPagesScreen/pageRecords'
import Page from '@/models/Page'
import Book from '@/models/Book'
import User from '@/models/User'

const validDate = (value) => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)))

export async function PUT(request) {
  const session = await getServerSession(authOptions)
  if (!hasBooksAccess(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id, expected, status, release } = await request.json().catch(() => ({})) ?? {}
    if (typeof id !== 'string' || !isUserId(id) || !expected || !PAGE_STATUSES.includes(expected.status) ||
        (expected.claimedById !== null && (typeof expected.claimedById !== 'string' || !isUserId(expected.claimedById))) ||
        !validDate(expected.claimedAt) || !validDate(expected.updatedAt) ||
        (release === true ? expected.status !== 'in-progress' : !PAGE_STATUSES.includes(status))) {
      return NextResponse.json({ error: 'בקשת העדכון אינה עדכנית או תקינה. רענן את הרשימה ונסה שוב.' }, { status: 400 })
    }

    await connectDB()
    const filter = {
      _id: id,
      status: expected.status,
      claimedBy: expected.claimedById,
      claimedAt: expected.claimedAt,
      updatedAt: expected.updatedAt,
    }
    const update = release === true
      ? { $set: { status: 'available' }, $unset: { claimedBy: '', claimedAt: '', completedAt: '', lastAutoReminderAt: '', quotaUserId: '', quotaSlot: '' } }
      : { $set: { status } }

    const saved = await Page.findOneAndUpdate(filter, update, { returnDocument: 'after', projection: 'updatedAt claimedAt' }).lean()
    if (saved) return NextResponse.json({ success: true, outcome: 'updated', updatedAt: saved.updatedAt, claimedAt: saved.claimedAt ?? null })

    const current = await Page.findById(id).select(PAGE_METADATA).lean()
    if (!current) return NextResponse.json({ success: true, outcome: 'gone' })
    const [book, worker] = await Promise.all([
      Book.findById(current.book).select('name').lean(),
      current.claimedBy ? User.findById(current.claimedBy).select('name').lean() : null,
    ])
    return NextResponse.json({
      success: true,
      outcome: 'changed',
      page: formatPageRecord(current, book?.name, worker?.name),
    })
  } catch (error) {
    console.error('Admin page update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

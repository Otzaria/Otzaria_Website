import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import mongoose from 'mongoose'
import { ACTIVE_STATUSES } from '@/lib/bookinfo/service'
import BookInfoChangeSet from '@/models/BookInfoChangeSet'
import { hasBooksAccess } from '@/lib/roles'
import { requireAccess, serverError } from '@/lib/apiResponse'

const LIMIT = 200

/** עריכות מידע-על-ספרים שנשלחו כ-PR לריפו הספרייה, מהחדשה לישנה, לתצוגה בדף הניהול. */
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    const denied = requireAccess(session, hasBooksAccess)
    if (denied) return denied

    await connectDB()
    const params = new URL(request.url).searchParams
    const filter = params.get('active') === 'false' ? {} : { status: { $in: ACTIVE_STATUSES } }
    if (params.has('cursor')) {
      let cursor
      try { cursor = JSON.parse(Buffer.from(params.get('cursor'), 'base64url').toString('utf8')) } catch { return NextResponse.json({ success: false, error: 'סמן עמוד לא תקין' }, { status: 400 }) }
      if (!mongoose.isValidObjectId(cursor?.id) || !Number.isFinite(Date.parse(cursor?.at))) return NextResponse.json({ success: false, error: 'סמן עמוד לא תקין' }, { status: 400 })
      filter.$or = [{ createdAt: { $lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), _id: { $lt: cursor.id } }]
    }
    const docs = await BookInfoChangeSet.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(LIMIT + 1)
      .populate('submittedBy', 'name')
      .lean()

    const page = docs.slice(0, LIMIT)
    const last = page.at(-1)
    const nextCursor = docs.length > LIMIT ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: String(last._id) })).toString('base64url') : null
    const rows = page.map((doc) => {
      const op = doc.ops?.[0] || {}
      return {
        id: String(doc._id),
        book: op.book || '',
        author: op.author || '',
        changes: op.changes || {},
        status: doc.status,
        prNumber: doc.prNumber,
        prUrl: doc.prUrl,
        lastError: doc.lastError,
        submittedBy: doc.submittedBy?.name || null,
        createdAt: doc.createdAt
      }
    })

    return NextResponse.json({ success: true, rows, nextCursor }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('GET /api/admin/book-info/change-sets failed:', error)
    return serverError('שגיאה בטעינת הבקשות')
  }
}

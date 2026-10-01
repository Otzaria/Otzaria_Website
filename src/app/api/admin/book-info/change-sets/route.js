import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfoChangeSet from '@/models/BookInfoChangeSet'
import { hasBooksAccess } from '@/lib/roles'
import { requireAccess, serverError } from '@/lib/apiResponse'

const LIMIT = 200

/** עריכות מידע-על-ספרים שנשלחו כ-PR לריפו הספרייה, מהחדשה לישנה, לתצוגה בדף הניהול. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const denied = requireAccess(session, hasBooksAccess)
    if (denied) return denied

    await connectDB()
    const docs = await BookInfoChangeSet.find({})
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .populate('submittedBy', 'name')
      .lean()

    const rows = docs.map((doc) => {
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

    return NextResponse.json({ success: true, rows }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('GET /api/admin/book-info/change-sets failed:', error)
    return serverError('שגיאה בטעינת הבקשות')
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import Book from '@/models/Book'
import Page from '@/models/Page'
import { releaseExpiredPageClaims } from '@/lib/bookPageClaims'
import { isPersonalBook } from '@/lib/pageClaimPolicy'
import { hasBookLibraryAccess } from '@/lib/roles'
import { formatEditorPageContent } from '@/lib/editor/pageContent'
import { normalizeBookFinishQuestions } from '@/lib/finishQuestions'

const headers = { 'Cache-Control': 'private, no-store' }
const error = (status, message) => NextResponse.json({ error: message }, { status, headers })

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?._id || session?.user?.id
    if (!userId) return error(401, 'יש להתחבר כדי לערוך עמוד')

    const value = new URL(request.url).searchParams.get('page')
    const pageNumber = Number(value)
    if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      return error(400, 'מספר עמוד לא תקין')
    }

    const { id } = await params
    let identifier = id
    try {
      identifier = decodeURIComponent(id)
    } catch {
      // Next עשוי כבר לפענח את הנתיב, כולל שם ספר שבו סימן אחוז.
    }
    await connectDB()

    const book = await Book.findOne({ $or: [{ slug: identifier }, { name: identifier }] }).lean()
    if (!book) return error(404, 'הספר לא נמצא')
    const isAdmin = hasBookLibraryAccess(session.user)
    const isOwner = Boolean(book.ownerId && String(book.ownerId) === String(userId))
    if ((book.isHidden || book.isPrivate) && !isAdmin && !isOwner) {
      return error(403, 'אין הרשאות לצפייה בספר זה')
    }

    if (!isPersonalBook(book)) await releaseExpiredPageClaims({ bookId: book._id })

    // שומרים על ברירות המחדל של Mongoose עבור גרסת התוכן של עמודים ישנים.
    const page = await Page.findOne({ book: book._id, pageNumber })
    if (!page) return error(404, 'העמוד לא נמצא')
    const claimedById = page.claimedBy == null ? null : String(page.claimedBy)
    if (page.status !== 'available' && !isAdmin && claimedById !== String(userId)) {
      if (page.claimedBy) await page.populate('claimedBy', 'name')
      return error(403, `אין לך הרשאה לערוך דף זה. הדף נמצא בטיפול על ידי ${page.claimedBy?.name || 'משתמש אחר'}.`)
    }

    return NextResponse.json({
      success: true,
      book: {
        id: book._id,
        name: book.name,
        slug: book.slug,
        path: book.slug,
        totalPages: book.totalPages,
        editingInfo: book.editingInfo || null,
        examplePage: book.examplePage || null,
        finishQuestions: normalizeBookFinishQuestions(book.finishQuestions),
      },
      data: {
        ...formatEditorPageContent(page),
        number: page.pageNumber,
        claimedById,
        claimedAt: page.claimedAt,
        completedAt: page.completedAt,
      },
    }, { headers })
  } catch (err) {
    console.error('Get editor page error:', err)
    return error(500, 'שגיאה בטעינת תוכן העמוד')
  }
}

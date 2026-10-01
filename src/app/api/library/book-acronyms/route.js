import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse'
import AcronymChangeSet from '@/models/AcronymChangeSet'
import { AcronymsInputError, getForkSnapshot, listOpenChangeSets, submitChangeSet } from '@/lib/acronyms/service'

export const maxDuration = 300

const anySignedIn = () => true
const MAX_OPEN_PER_USER = 20
const MIN_SECONDS_BETWEEN_SUBMISSIONS = 15

// הכינויים נקראים מהפורק Otzaria/SeforimAcronymizer, וכל סל נשלח אליו כ-PR.
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const denied = requireAccess(session, anySignedIn)
    if (denied) return denied

    await connectDB()
    const [snapshot, pending] = await Promise.all([getForkSnapshot(), listOpenChangeSets()])
    return NextResponse.json(
      { success: true, headSha: snapshot.headSha, books: snapshot.books.map(({ title, aliases }) => ({ title, aliases })), pending },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    console.error('GET /api/library/book-acronyms failed:', error)
    return serverError('שגיאה בטעינת הכינויים')
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    const denied = requireAccess(session, anySignedIn)
    if (denied) return denied
    const userId = session.user._id || session.user.id

    const body = await request.json().catch(() => null)
    if (!Array.isArray(body?.ops)) return badRequest('יש לשלוח רשימת שינויים')

    await connectDB()
    const [openCount, last] = await Promise.all([
      AcronymChangeSet.countDocuments({ submittedBy: userId, status: { $in: ['publishing', 'open'] } }),
      AcronymChangeSet.findOne({ submittedBy: userId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    ])
    if (openCount >= MAX_OPEN_PER_USER) {
      return NextResponse.json({ success: false, error: `יש לך כבר ${openCount} בקשות פתוחות; נא להמתין לבדיקתן` }, { status: 429 })
    }
    if (last && Date.now() - new Date(last.createdAt).getTime() < MIN_SECONDS_BETWEEN_SUBMISSIONS * 1000) {
      return NextResponse.json({ success: false, error: 'נשלחה בקשה לפני רגע; נא לנסות שוב בעוד כמה שניות' }, { status: 429 })
    }

    const result = await submitChangeSet({ rawOps: body.ops, userId })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof AcronymsInputError) return badRequest(error.message)
    console.error('POST /api/library/book-acronyms failed:', error)
    return serverError('שגיאה בפתיחת הבקשה לעדכון הכינויים. ייתכן שהיא נפתחה בכל זאת; אם השינויים יופיעו בדף כממתינים בעוד כמה דקות, אין צורך לשלוח שוב')
  }
}

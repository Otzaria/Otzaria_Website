// דף רשימת עמודי אימון OCR (סימון שורות למתנדבים): Server Component —
// הרשימה הראשונית נשלפת ישירות מה-DB (אותה שאילתה בדיוק כמו
// /api/ocr-training, ראו src/app/api/ocr-training/route.js) בזמן הרינדור,
// ולא בקריאת fetch מהדפדפן אחרי הטעינה. force-dynamic כי הרשימה תלוית-
// משתמש (claimedBy) ומשתנה כל הזמן — עמודים "נתפסים" על ידי משתמשים אחרים
// בכל רגע, וטעינה מיושנת עלולה להראות עמוד כזמין כשהוא כבר נתפס.
export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import OcrTrainingPage from '@/models/OcrTrainingPage'
import OcrTrainingListClient from './OcrTrainingListClient'

// זהה ללוגיקה ב-GET /api/ocr-training: עמודים זמינים + עמודים שתפסתי.
async function loadInitialPages(userId) {
  await connectDB()
  const query = { $or: [{ status: 'available' }, { claimedBy: userId }] }
  const docs = await OcrTrainingPage.find(query).sort({ updatedAt: -1 }).lean()

  return docs.map((d) => {
    const filled = (d.lines || []).filter((l) => l.text && l.text.trim()).length
    const mine = d.claimedBy && String(d.claimedBy) === String(userId)
    return {
      id: String(d._id),
      bookName: d.bookName,
      pageNumber: d.pageNumber,
      imagePath: d.imagePath,
      status: d.status,
      scriptType: d.scriptType || 'square',
      targetLines: d.targetLines,
      filledLines: filled,
      mine,
      claimedByName: d.claimedByName || null,
    }
  })
}

export default async function OcrTrainingListPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/auth/login?callbackUrl=' + encodeURIComponent('/library/ocr-training'))
  }

  const userId = session.user.id || session.user._id
  let initialPages = []
  let loadError = false
  try {
    initialPages = await loadInitialPages(userId)
  } catch (err) {
    console.error('OCR training initial list error:', err)
    loadError = true
  }

  return <OcrTrainingListClient initialPages={initialPages} loadError={loadError} />
}

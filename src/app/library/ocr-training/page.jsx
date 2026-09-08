// דף רשימת עמודי אימון OCR (סימון שורות למתנדבים): Server Component —
// הרשימה הראשונית נשלפת ישירות מה-DB (אותה שאילתה בדיוק כמו
// /api/ocr-training, ראו src/app/api/ocr-training/route.js) בזמן הרינדור,
// ולא בקריאת fetch מהדפדפן אחרי הטעינה.
//
// force-dynamic: הדף תלוי בסשן (הפניה למי שאינו מחובר, ו-userId לשאילתה)
// ולכן חייב לרוץ מחדש בכל בקשה כדי לדעת מי המשתמש; זה שולט רק על ה-Full
// Route Cache (רינדור הדף עצמו) ולא סותר את המטמון המתואר למטה.
//
// מטמון (Data Cache של Next, לא HTTP): השאילתה תלויה במשתמש הנוכחי
// ($or: [{status:'available'}, {claimedBy: userId}]) — התוצאה שונה לכל
// משתמש (מי "שלי" משתנה), ולכן אסור לשתף רשומת מטמון אחת בין כל המשתמשים
// (הדבר היה חושף לכל משתמש אילו עמודים ספציפית תפס משתמש אחר). לכן
// loadInitialPages עטוף ב-unstable_cache עם userId כארגומנט הקריאה —
// ל-unstable_cache ה-args שהתקבלו בקריאה הם חלק מובנה ממפתח המטמון (ראו
// next/dist/server/web/spec-extension/unstable-cache.js), כך שכל משתמש
// מקבל רשומת מטמון נפרדת משלו, בטוח מבחינת פרטיות.
// תגית OCR_TRAINING_LIST משותפת לכל הרשומות (על אף שהמפתח שונה): כל route
// שמשנה status/claimedBy/lines של עמוד קורא ל-revalidateTag על התגית הזו
// מיד אחרי כתיבה מוצלחת — וזה מבטל בבת אחת את רשומות המטמון של *כל*
// המשתמשים (לא רק את זו של מי שביצע את הפעולה), כך שמשתמש אחר יראה עמוד
// שנתפס כלא-זמין כמעט מיד. ראו src/lib/cacheTags.js.
export const dynamic = 'force-dynamic'

import { unstable_cache as nextCache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import OcrTrainingPage from '@/models/OcrTrainingPage'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import OcrTrainingListClient from './OcrTrainingListClient'

// זהה ללוגיקה ב-GET /api/ocr-training: עמודים זמינים + עמודים שתפסתי.
async function loadInitialPagesUncached(userId) {
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

// userId מועבר כארגומנט לפונקציה המוחזרת (לא כחלק מ-keyParts) — ומספיק,
// כי unstable_cache כולל את הארגומנטים במפתח המטמון בעצמו (ראו ההסבר למעלה).
const loadInitialPages = nextCache(loadInitialPagesUncached, ['ocr-training-list'], {
  tags: [CACHE_TAGS.OCR_TRAINING_LIST],
  revalidate: REVALIDATE_SECONDS.OCR_TRAINING_LIST
})

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

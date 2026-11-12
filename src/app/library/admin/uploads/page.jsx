// עמוד ניהול ההעלאות (/library/admin/uploads).
//
// Server Component: רשימת ההעלאות (שאינן באשפה) נשלפת ישירות מה-DB (אותה
// לוגיקה בדיוק כמו /api/admin/uploads/list, ראו
// src/app/api/admin/uploads/list/route.js) בזמן הרינדור. עמוד זה נגיש רק
// למנהלים דרך proxy.js, והשאילתה אינה מסוננת לפי משתמש — הנתון זהה לכל מי
// שמגיע לכאן. כל האינטראקציה (סינון/חיפוש/קיבוץ/דיאלוגים/פעולות) ב-UploadsScreen
// (src/components/admin/uploads), שמעדכן את הרשימה בעצמו אחרי כל פעולה.
// אותו מסך משמש גם את האשפה (/library/admin/trash) — לשונית שנייה.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת בזיכרון השרת עם תגית
// UPLOADS_ADMIN_LIST וחלון גיבוי קצר. כל route שמשנה העלאה (העברה/שחזור
// מאשפה, עדכון סטטוס/סטטוס-ספר, יצירת עותק עריכה) קורא ל-revalidateTag מיד
// אחרי כתיבה מוצלחת (ראו src/lib/cacheTags.js).
import { unstable_cache as nextCache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Upload from '@/models/Upload'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import UploadsScreen from '@/components/admin/uploads/UploadsScreen'
import { loadBookStatuses, loadUploadsCounts } from './uploadsPageData'

// ליטרל מספרי בכוונה (לא REVALIDATE_SECONDS.UPLOADS_ADMIN_LIST) — ה-segment
// config של Next נחלץ ע"י ניתוח AST סטטי שלא תומך ב-property access על אובייקט
// מיובא; לעדכן ידנית יחד עם REVALIDATE_SECONDS.UPLOADS_ADMIN_LIST.
export const revalidate = 30

async function loadAdminUploadsUncached() {
  await dbConnect()

  // מציג רק העלאות שלא באשפה (מקביל בדיוק ל-/api/admin/uploads/list)
  // בלי content: בהעלאות ישנות הקובץ עצמו שמור בתוך המסמך (Buffer) — כ-300MB לכל הרשימה,
  // ושליפתם לקחה דקות. המסך לא צריך את התוכן (ההורדה עוברת דרך /api/download).
  const uploads = await Upload.find({ isDeleted: false })
    .select('-content')
    .populate('uploader', 'name email')
    .sort({ createdAt: -1 })
    .lean()

  const formatted = uploads.map((u) => ({
    id: u._id.toString(),
    bookName: u.bookName,
    originalFileName: u.originalFileName,
    uploadedBy: u.uploader?.name,
    uploadedByEmail: u.uploader?.email,
    // מזהה המעלה — ל"שלח הודעה" ישירות (בלי לטעון את כל המשתמשים). רק כאן, בנתוני העמוד —
    // התשובה של /api/admin/uploads/list לא השתנתה (הדיאלוג מסתדר גם בלעדיו)
    uploaderId: u.uploader?._id ? u.uploader._id.toString() : null,
    uploadedAt: u.createdAt,
    uploadType: u.uploadType || 'single_page',
    status: u.status,
    bookStatus: u.bookStatus || 'not_checked',
    editCopy: u.editCopy ? u.editCopy.toString() : null,
    editCopyCreatedAt: u.editCopyCreatedAt,
    authorName: u.authorName,
    bookCategory: u.bookCategory,
    authorCategory: u.authorCategory,
    authorYear: u.authorYear,
    publicationYear: u.publicationYear,
    copyrightHolder: u.copyrightHolder,
    sourceUrl: u.sourceUrl,
    isOcr: u.isOcr,
    ocrDescription: u.ocrDescription,
    allowOtherPlatforms: u.allowOtherPlatforms
  }))

  // סריאליזציה בטוחה בגבול Server->Client Component (ObjectId/Date -> מחרוזת)
  return JSON.parse(JSON.stringify(formatted))
}

const loadAdminUploads = nextCache(loadAdminUploadsUncached, ['uploads-admin-list'], {
  tags: [CACHE_TAGS.UPLOADS_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.UPLOADS_ADMIN_LIST
})

export default async function AdminUploadsPage() {
  const session = await getServerSession(authOptions)
  let initialUploads = []
  let initialError = false
  const [uploadsResult, statuses, counts] = await Promise.all([
    loadAdminUploads().then((list) => ({ list }), (error) => ({ error })),
    loadBookStatuses(),
    loadUploadsCounts(),
  ])
  if (uploadsResult.error) {
    // כשל בטעינה — הודעה בתוך הדף ו"נסה שוב" (ולא רשימה ריקה שנראית כמו "אין העלאות")
    console.error('Error loading admin uploads:', uploadsResult.error)
    initialError = true
  } else {
    initialUploads = uploadsResult.list
  }

  return (
    <UploadsScreen
      tab="uploads"
      initialItems={initialUploads}
      initialError={initialError}
      initialStatuses={statuses}
      counts={{ uploads: initialError ? counts?.uploads : initialUploads.length, trash: counts?.trash }}
      role={session?.user?.role}
    />
  )
}

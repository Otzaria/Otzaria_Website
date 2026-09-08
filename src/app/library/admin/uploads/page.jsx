// עמוד ניהול ההעלאות (/library/admin/uploads).
//
// Server Component: רשימת ההעלאות (שאינן באשפה) נשלפת ישירות מה-DB (אותה
// לוגיקה בדיוק כמו /api/admin/uploads/list, ראו
// src/app/api/admin/uploads/list/route.js) בזמן הרינדור. עמוד זה נגיש רק
// למנהלים דרך proxy.js, והשאילתה אינה מסוננת לפי משתמש — הנתון זהה לכל מי
// שמגיע לכאן. כל האינטראקציה (סינון/חיפוש/קיבוץ/דיאלוגים/פעולות) נשארת
// ב-AdminUploadsClient, שממשיך לרענן את עצמו מול ה-API הרגיל אחרי כל פעולה,
// בדיוק כפי שהתנהג הדף לפני המעבר.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת בזיכרון השרת עם תגית
// UPLOADS_ADMIN_LIST וחלון גיבוי קצר. כל route שמשנה העלאה (העברה/שחזור
// מאשפה, עדכון סטטוס/סטטוס-ספר, יצירת עותק עריכה) קורא ל-revalidateTag מיד
// אחרי כתיבה מוצלחת (ראו src/lib/cacheTags.js).
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import Upload from '@/models/Upload'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import AdminUploadsClient from './AdminUploadsClient'

export const revalidate = REVALIDATE_SECONDS.UPLOADS_ADMIN_LIST

async function loadAdminUploadsUncached() {
  await dbConnect()

  // מציג רק העלאות שלא באשפה (מקביל בדיוק ל-/api/admin/uploads/list)
  const uploads = await Upload.find({ isDeleted: false })
    .populate('uploader', 'name email')
    .sort({ createdAt: -1 })
    .lean()

  const formatted = uploads.map((u) => ({
    id: u._id.toString(),
    bookName: u.bookName,
    originalFileName: u.originalFileName,
    uploadedBy: u.uploader?.name,
    uploadedByEmail: u.uploader?.email,
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
    ocrDescription: u.ocrDescription
  }))

  // סריאליזציה בטוחה בגבול Server->Client Component (ObjectId/Date -> מחרוזת)
  return JSON.parse(JSON.stringify(formatted))
}

const loadAdminUploads = nextCache(loadAdminUploadsUncached, ['uploads-admin-list'], {
  tags: [CACHE_TAGS.UPLOADS_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.UPLOADS_ADMIN_LIST
})

export default async function AdminUploadsPage() {
  let initialUploads = []
  try {
    initialUploads = await loadAdminUploads()
  } catch (error) {
    console.error('Error loading admin uploads:', error)
  }

  return <AdminUploadsClient initialUploads={initialUploads} />
}

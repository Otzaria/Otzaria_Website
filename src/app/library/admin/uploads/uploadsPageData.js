// נתוני השרת של מסך ההעלאות — משותפים לשתי הלשוניות (/library/admin/uploads ו-/library/admin/trash).
// קריאה בלבד, ישירות מה-DB (כמו עמוד ההעלאות עצמו), בלי מטמון משותף: הספירות קטנות ומהירות
// (אינדקס isDeleted), והן משתנות בכל מחיקה/שחזור.
import dbConnect from '@/lib/db'
import Upload from '@/models/Upload'
import SystemConfig from '@/models/SystemConfig'

/** כמה העלאות בכל לשונית — למונים שליד שמות הלשוניות. כשל — null (הלשונית בלי מספר). */
export async function loadUploadsCounts() {
  try {
    await dbConnect()
    const [uploads, trash] = await Promise.all([
      Upload.countDocuments({ isDeleted: false }).maxTimeMS(5000),
      Upload.countDocuments({ isDeleted: true }).maxTimeMS(5000),
    ])
    return { uploads, trash }
  } catch (error) {
    console.error('Error counting uploads:', error)
    return null
  }
}

/** הגדרות המצבים (מפתח → תווית וצבע), כמו GET /api/admin/book-statuses; אין / כשל — null (הלקוח ישלים) */
export async function loadBookStatuses() {
  try {
    await dbConnect()
    const config = await SystemConfig.findOne({ key: 'book_statuses' }).lean()
    return config?.value ? JSON.parse(JSON.stringify(config.value)) : null
  } catch (error) {
    console.error('Error loading book statuses:', error)
    return null
  }
}

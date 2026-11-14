// האשפה של ההעלאות (/library/admin/trash) — לשונית "אשפה" במסך ההעלאות.
//
// הכתובת נשארת (יש אליה קישורים, וה-proxy מתיר אותה למנהלים ולמנהלי ספרים), ומציגה את אותו מסך
// כמו /library/admin/uploads, עם הלשונית "אשפה" פעילה. "העלאות" בסרגל מסומן פעיל גם כאן
// (alsoActiveOn ב-adminNav). רשימת האשפה נטענת בדפדפן (/api/admin/uploads/trash, כמו קודם);
// כאן רק המונים, הגדרות המצבים והתפקיד.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import UploadsScreen from '@/components/admin/uploads/UploadsScreen'
import { loadBookStatuses, loadUploadsCounts } from '../uploads/uploadsPageData'
import { getRoles } from '@/lib/roles'

export default async function AdminTrashPage() {
  const session = await getServerSession(authOptions)
  const [statuses, counts] = await Promise.all([loadBookStatuses(), loadUploadsCounts()])
  return (
    <UploadsScreen
      tab="trash"
      initialStatuses={statuses}
      counts={counts || undefined}
      role={getRoles(session?.user)}
    />
  )
}

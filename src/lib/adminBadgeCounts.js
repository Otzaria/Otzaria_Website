import connectDB from '@/lib/db'
import Message from '@/models/Message'
import Upload from '@/models/Upload'
import Plugin from '@/models/Plugin'
import { adminBadgeScope, EMPTY_ADMIN_BADGE_COUNTS } from '@/lib/adminBadgeScope'

// מוני-התג של פאנל הניהול (הודעות שלא נקראו / העלאות ממתינות / תוספים ממתינים).
//
// קודם ה-layout של /library/admin הוריד שלוש רשימות מלאות רק כדי לספור אותן:
// /api/messages?allMessages=true (כ-1.4MB JSON עם כל ההודעות והתגובות),
// /api/admin/uploads/list (כ-300KB) ו-/api/admin/plugins?status=pending — בכל
// טעינת עמוד ניהול ושוב כל 60 שניות. כאן זו ספירה בצד ה-DB, עם אותם תנאים
// בדיוק כמו הסינון שהיה בצד הלקוח:
// - unreadMessages: אותה שאילתה כמו getAdminMessagesList (messageType != 'system'),
//   ו-status==='unread' שם פירושו !isRead — כלומר isRead שאינו true.
// - pendingUploads: אותה שאילתה כמו /api/admin/uploads/list (isDeleted: false)
//   ועוד status==='pending'.
// - pendingPlugins: אותה שאילתה בדיוק כמו ענף ה-pending של GET /api/admin/plugins.
//
// התוצאה תלויה בתפקיד (מי רואה איזה מונה), לכן לא ממוטמנת ולא משותפת בין
// משתמשים; הספירות עצמן זולות.
export async function getAdminBadgeCounts(role) {
  const scope = adminBadgeScope(role)
  if (!scope.messages && !scope.uploads && !scope.plugins) return { ...EMPTY_ADMIN_BADGE_COUNTS }

  await connectDB()

  const [unreadMessages, pendingUploads, pendingPlugins] = await Promise.all([
    scope.messages
      ? Message.countDocuments({ messageType: { $ne: 'system' }, isRead: { $ne: true } })
      : 0,
    scope.uploads
      ? Upload.countDocuments({ isDeleted: false, status: 'pending' })
      : 0,
    scope.plugins
      ? Plugin.countDocuments({
          isHidden: false,
          $or: [{ isApproved: false }, { pendingUpdate: { $ne: null } }],
        })
      : 0,
  ])

  return { unreadMessages, pendingUploads, pendingPlugins }
}

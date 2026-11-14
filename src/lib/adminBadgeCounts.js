import { cache } from 'react'
import connectDB from '@/lib/db'
import Message from '@/models/Message'
import Upload from '@/models/Upload'
import Plugin from '@/models/Plugin'
import { adminBadgeScope, EMPTY_ADMIN_BADGE_COUNTS } from '@/lib/adminBadgeScope'
import { getRoles } from '@/lib/roles'
import { QUEUE_STATUS } from '@/lib/adminUploads/uploadTerms'

// מוני-התג של פאנל הניהול (הודעות שלא נקראו / העלאות ממתינות / תוספים ממתינים).
//
// קודם ה-layout של /library/admin הוריד שלוש רשימות מלאות רק כדי לספור אותן:
// /api/messages?allMessages=true (כ-1.4MB JSON עם כל ההודעות והתגובות),
// /api/admin/uploads/list (כ-300KB) ו-/api/admin/plugins?status=pending — בכל
// טעינת עמוד ניהול ושוב כל 60 שניות. כאן זו ספירה בצד ה-DB, עם אותם תנאים
// בדיוק כמו הסינון שהיה בצד הלקוח:
// - unreadMessages: אותה שאילתה כמו getAdminMessagesList (messageType != 'system'),
//   ו-status==='unread' שם פירושו !isRead — כלומר isRead שאינו true.
// - pendingUploads: העלאות שלא נבדקו — אותו תור כמו במסך ההעלאות (?status=not_checked):
//   שלא באשפה (isDeleted: false, כמו /api/admin/uploads/list), ובמצב הספר "לא נבדק". מסמך בלי
//   bookStatus (או ריק) נחשב "לא נבדק" — כמו ברשימה (bookStatus || 'not_checked'); $in עם null
//   תופס גם שדה חסר. (קודם — status: 'pending', שדה ישן שכל ההעלאות נמצאות בו ושאף מסך כבר לא
//   משנה, ולכן המונה לא ירד לעולם.)
// - pendingPlugins: אותה שאילתה בדיוק כמו ענף ה-pending של GET /api/admin/plugins.
//
// התנאים עצמם — משותפים גם לדשבורד (adminDashboardData.js), כדי שהמספר בכרטיס התור
// יהיה זהה תמיד למונה שבסרגל.
export const ADMIN_BADGE_FILTERS = Object.freeze({
  unreadMessages: { messageType: { $ne: 'system' }, isRead: { $ne: true } },
  pendingUploads: { isDeleted: false, bookStatus: { $in: [null, '', QUEUE_STATUS] } },
  pendingPlugins: {
    isHidden: false,
    hasService: { $ne: true },
    $or: [{ isApproved: false }, { pendingUpdate: { $ne: null } }],
  },
})

// תקרת זמן בצד השרת: ספירה איטית נעצרת ב-Mongo ולא ממשיכה להחזיק חיבור מה-pool.
const QUERY_MAX_TIME_MS = 7000

// התוצאה תלויה בתפקיד (מי רואה איזה מונה), לכן לא ממוטמנת ולא משותפת בין
// משתמשים; הספירות עצמן זולות.
export async function getAdminBadgeCounts(role) {
  const scope = adminBadgeScope(role)
  if (!scope.messages && !scope.uploads && !scope.plugins) return { ...EMPTY_ADMIN_BADGE_COUNTS }

  await connectDB()

  const [unreadMessages, pendingUploads, pendingPlugins] = await Promise.all([
    scope.messages
      ? Message.countDocuments(ADMIN_BADGE_FILTERS.unreadMessages, { maxTimeMS: QUERY_MAX_TIME_MS })
      : 0,
    scope.uploads
      ? Upload.countDocuments(ADMIN_BADGE_FILTERS.pendingUploads, { maxTimeMS: QUERY_MAX_TIME_MS })
      : 0,
    scope.plugins
      ? Plugin.countDocuments(ADMIN_BADGE_FILTERS.pendingPlugins, { maxTimeMS: QUERY_MAX_TIME_MS })
      : 0,
  ])

  return { unreadMessages, pendingUploads, pendingPlugins }
}

/**
 * אותן ספירות, פעם אחת לכל בקשה: ה-layout (מוני הסרגל) והדשבורד (כרטיסי ההודעות וההעלאות)
 * קוראים לה באותו רינדור ומקבלים אותה תוצאה — בלי לספור פעמיים, ובלי פער בין המונה לכרטיס.
 * cache של React חי רק בתוך רינדור אחד של Server Components (לא בין בקשות ולא בין משתמשים);
 * מחוץ לרינדור (ראוט API) הוא פשוט מריץ את הפונקציה.
 */
// המפתח של cache הוא מחרוזת התפקידים (לא האובייקט/המערך עצמו — cache משווה לפי זהות), כך שה-layout
// והדשבורד מקבלים אותה רשומה גם כשכל אחד מעביר session.user או מערך תפקידים משלו.
const countsForRolesKey = cache((rolesKey) => getAdminBadgeCounts(rolesKey ? rolesKey.split(',') : []))
export const getRequestAdminBadgeCounts = (subject) => countsForRolesKey(getRoles(subject).join(','))

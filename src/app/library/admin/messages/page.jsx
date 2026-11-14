// דף ניהול הודעות (/library/admin/messages) — Server Component: תור ההודעות
// המשותף לניהול (?allMessages=true) נשלף ישירות מה-DB בזמן הרינדור (אותה
// שאילתה בדיוק כמו GET /api/messages בענף הניהול, ראו
// src/lib/adminMessages.js:getAdminMessagesList, המשותפת לשני המקומות).
// האינטראקטיביות (לשוניות נכנסות / נשלחו / תזכורות, מגירת שיחה, סימון-כנקרא, מחיקה, הודעה חדשה)
// ב-MessagesScreen (src/components/admin/messages), שמקבל את הרשימה כ-prop.
//
// תזכורות: הלשונית ?view=reminders (/library/admin/reminders מפנה אליה). מוצגת רק למי ש-hasBooksAccess
// (מנהל כללי ומנהל ספרים — בדיוק מי שהיה מורשה לדף התזכורות; ה-API שלהן אוכף אותה בדיקה). מנהל תוספים רואה
// הודעות בלי תזכורות, כמו קודם.
//
// exactAudience — מנהל כללי יכול לספור במדויק כמה יקבלו הודעה "לכל המשתמשים" (/api/admin/users, שרק לו מותר);
// לאחרים — הערכה מרשימת המשתמשים הרגילים (ראו ComposeDrawer).
//
// כשל בטעינה — initialError: המסך מציג "לא הצלחנו לטעון" ו"נסה שוב" (קודם — רשימה ריקה, כאילו אין הודעות).
//
// ניתוח "משותף לכל הצופים" מול "תיבת דואר אישית" (נדרש לפני שממטמנים משהו
// admin-facing, ראו src/lib/cacheTags.js): קראנו את GET /api/messages —
// כשמדובר בבעל הרשאת ניהול כלשהי (hasAnyAdminAccess) עם ?allMessages=true,
// השאילתה היא { messageType: { $ne: 'system' } } — בלי שום סינון לפי sender/
// recipient/זהות הצופה. זו לא "תיבת הדואר שלי", אלא תור התמיכה המשותף לכל
// המנהלים: admin, admin_plugins ו-admin_books (הזהים היחידים שה-middleware
// מרשה להם להגיע לעמוד הזה, ראו src/proxy.js) רואים בדיוק את אותה רשימה.
// לכן זו בדיוק הדוגמה הבטוחה למטמון-משותף לפי התפקיד, לא מטמון-לפי-משתמש.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת עם תגית MESSAGES_ADMIN_LIST
// וחלון גיבוי קצר (ראו REVALIDATE_SECONDS — קצר יחסית כי הודעות חדשות מגיעות
// גם מהמשתמשים עצמם, לא רק מפעולת מנהל). כל route שיוצר/עונה/מוחק/מסמן הודעה
// קורא ל-revalidateTag מיד אחרי כתיבה מוצלחת (ראו src/lib/cacheTags.js).
//
// שער הרשאה: כמו בדף המשתמשים, ה-middleware כבר חוסם הגעה לעמוד הזה למי
// שאינו בעל הרשאת ניהול (hasAnyAdminAccess) — אבל בודקים זאת שוב כאן, לפני
// הקריאה לפונקציה הממוטמנת, כהגנת-עומק: אחרת ה-props שנשלחים ללקוח יזלגו את
// כל תור ההודעות (כולל הודעות של/למשתמשים אחרים) למי שהגיע לכתובת הזו בלי
// הרשאה (אם ה-middleware ידלג מסיבה כלשהי — token חסר, למשל, ראו proxy.js).
import { getServerSession } from 'next-auth'
import { unstable_cache as nextCache } from 'next/cache'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { Suspense } from 'react'
import { hasAnyAdminAccess, hasBooksAccess, isAdmin, getRoles } from '@/lib/roles'
import { getAdminMessagesList } from '@/lib/adminMessages'
import { toAdminMessageListItem } from '@/lib/adminMessagesView'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import { viewFromParams } from '@/lib/adminMessagesScreen/messagesQuery'
import MessagesScreen from '@/components/admin/messages/MessagesScreen'
import { MessagesScreenSkeleton } from '@/components/admin/messages/MessagesSkeleton'

// ליטרל מספרי בכוונה (לא REVALIDATE_SECONDS.MESSAGES_ADMIN_LIST) — ה-segment
// config של Next נחלץ ע"י ניתוח AST סטטי שלא תומך ב-property access על אובייקט
// מיובא; לעדכן ידנית יחד עם REVALIDATE_SECONDS.MESSAGES_ADMIN_LIST.
export const revalidate = 300

const loadAdminMessages = nextCache(getAdminMessagesList, ['admin-messages-list'], {
  tags: [CACHE_TAGS.MESSAGES_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.MESSAGES_ADMIN_LIST
})

export default async function AdminMessagesPage({ searchParams }) {
  const session = await getServerSession(authOptions)
  // כל התפקידים של הצופה (roles.js) — לא רק הראשי
  const role = getRoles(session?.user)
  const canRemind = hasBooksAccess(role)
  const view = viewFromParams(await searchParams)

  let messages = []
  let error = false
  if (hasAnyAdminAccess(role)) {
    try {
      // רק השדות שהדף מציג — הרשימה נכנסת כולה ל-HTML (ראו adminMessagesView.js)
      messages = (await loadAdminMessages()).map(toAdminMessageListItem)
    } catch (e) {
      console.error('Error loading admin messages:', e)
      error = true
    }
  }

  // Suspense — MessagesScreen קורא את הכתובת (useSearchParams)
  return (
    <Suspense fallback={<MessagesScreenSkeleton view={view} canRemind={canRemind} />}>
      <MessagesScreen
        initialMessages={messages}
        initialError={error}
        canRemind={canRemind}
        viewerName={session?.user?.name || ''}
        exactAudience={isAdmin(role)}
      />
    </Suspense>
  )
}

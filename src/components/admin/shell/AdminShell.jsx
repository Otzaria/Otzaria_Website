'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ToastProvider } from '@/components/ui/Toast'
import Header from '@/components/layout/Header'
import { attentionTotal, buildAdminNavGroups, buildAttentionItems, getActiveNavItemId, toAdminViewer } from '@/lib/adminNav'
import { useAdminBadgeCounts } from './useAdminBadgeCounts'
import AdminSidebarNav from './AdminSidebarNav'
import AdminShellActions from './AdminShellActions'
import AdminMenuButton from './AdminMenuButton'
import AdminDrawer from './AdminDrawer'

// מעל זה הסרגל קבוע בצד; מתחתיו — כפתור "ניהול" (בכותרת האתר) ומגירה. זהה ל-xl של Tailwind
// (--breakpoint-xl ב-layout.css), שבו מוחלפות גם מחלקות ה-xl: כאן.
// לא lg (1024): בין 1024 ל-1280 הסרגל השאיר לתוכן כ-660px, ועמודי הניהול הקיימים (ספרים,
// העלאות) נשפכו לרוחב וגרמו לגלילה אופקית בגוף הדף. מתחת ל-xl התוכן מקבל את מלוא הרוחב, כמו קודם.
const DESKTOP_QUERY = '(min-width: 80rem)'

// "ניהול" בראש הסרגל — תווית שקטה, באותו קו אנכי כמו כותרות הקבוצות והאייקונים (px-3), ובאותו
// קו אופקי כמו ראש ה-h1 של העמוד (pt — מפצה על ריפוד הסרגל ועל המרווח שמעל אותיות הכותרת)
const AREA_LABEL = 'px-3 pb-2 pt-1.5 text-label-md text-on-surface-variant'
// כמה פיקסלים נשארים מסביב לפריט הפעיל כשהסרגל נגלל אליו
const SIDEBAR_SCROLL_MARGIN = 8

/**
 * מעטפת הניהול: כותרת האתר, סרגל צד (במחשב) או מגירה (בטלפון), ותוכן העמוד.
 * כפתור "ניהול" שפותח את המגירה — בשורה העליונה, בכותרת האתר (Header adminMenu), ולא בשורה משלו מעל
 * כותרת העמוד: כך בטלפון ראש העמוד הוא כבר שם המסך. לכן הכותרת מרונדרת כאן ולא ב-AdminFrame —
 * הכפתור והמגירה חולקים מצב (פתוח / סגור, המונים).
 * בלי כותרת משלה: ה-h1 של כל עמוד הוא שם המסך (AdminScreenHeader) — "ניהול" ושם התפקיד לא חוזרים
 * מעל כל עמוד, אלא יושבים בשקט בסרגל: "ניהול" בראשו (AREA_LABEL), ושם התפקיד בתחתיתו, ליד
 * "חזרה לאזור האישי". ראש הסרגל וראש העמוד מתחילים באותו קו.
 * משמשת את /library/admin, את /library/corrections ואת שני מסכי מרחב העריכה (/library/dicta-edit/moderation,
 * conflicts) — דרך AdminFrame.
 *
 * viewer ({ roles, isCorrectionsVolunteer, isSupervisor }), initialCounts ו-canBackup מגיעים מה-layout
 * (Server Component), כדי שהסרגל והמונים יהיו כבר ב-HTML — בלי קפיצת תוכן אחרי ה-hydration.
 * useSession משמש רק כעדכון אם התפקיד או הדגל השתנו בצד הלקוח.
 * צופה שאין לו אף פריט בסרגל (משתמש רגיל שנכנס לכתובת של דיווחי הטעויות) — רק הכותרת והתוכן,
 * בלי סרגל, בלי כפתור תפריט ובלי מגירה — רק התוכן; העמוד עצמו מציג לו "אין הרשאה" כמו קודם.
 * ההודעות הקופצות (ToastProvider) — כאן, ולא בכל מסך: הודעה עם "בטל" שורדת מעבר בין לשוניות
 * ומסכים (למשל "מחק" ואז לשונית "אשפה").
 * הסרגל ארוך מהמסך: הפריט הפעיל נגלל לתוך הסרגל (בלי לגעת בגלילה של הדף), אחרת מי שבקבוצה התחתונה לא רואה
 * איפה הוא.
 */
export default function AdminShell({ viewer: serverViewer, initialCounts, canBackup, children }) {
  const pathname = usePathname()
  // התצוגה שבכתובת (?view=) — בעמוד אחד עם כמה פריטים בסרגל (תוספים: לאישור / בחנות / ...)
  const searchParams = useSearchParams()
  const view = searchParams?.get('view') || ''
  const legacyTab = searchParams?.get('tab') || ''
  const { data: session } = useSession()
  const { roles, isCorrectionsVolunteer, isSupervisor } = toAdminViewer(session?.user ?? serverViewer)
  // מערך התפקידים נבנה מחדש בכל רינדור — התלות היא במחרוזת שלו, כדי שהזיכרון לא יתבטל סתם
  const rolesKey = roles.join(',')
  const viewer = useMemo(
    () => ({ roles: rolesKey ? rolesKey.split(',') : [], isCorrectionsVolunteer, isSupervisor }),
    [rolesKey, isCorrectionsVolunteer, isSupervisor]
  )
  // המונים לפי התפקידים בלבד; בלי מונה (למשל מתנדב תיקונים) — בלי בקשות ל-/api/badge-counts
  const counts = useAdminBadgeCounts(viewer.roles, initialCounts)

  const groups = useMemo(() => buildAdminNavGroups(viewer), [viewer])
  const activeId = useMemo(
    () => getActiveNavItemId(groups.flatMap((g) => g.items), pathname, new URLSearchParams({ ...(view && { view }), ...(legacyTab && { tab: legacyTab }) })),
    [groups, pathname, view, legacyTab]
  )
  const attention = useMemo(() => buildAttentionItems(viewer, counts), [viewer, counts])
  const total = attentionTotal(attention)
  const hasNav = groups.length > 0

  // המגירה פתוחה רק בכתובת שבה נפתחה: מעבר עמוד (גם בכפתורי הדפדפן) סוגר אותה בלי effect
  const [drawerPath, setDrawerPath] = useState(null)
  const drawerOpen = drawerPath !== null && drawerPath === pathname
  const closeDrawer = () => setDrawerPath(null)

  // הרחבת החלון לרוחב מחשב כשהמגירה פתוחה — נסגרת (הסרגל כבר גלוי, ונעילת הגלילה משתחררת)
  useEffect(() => {
    if (!drawerOpen) return undefined
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event) => { if (event.matches) setDrawerPath(null) }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [drawerOpen])

  const sidebarRef = useRef(null)
  useEffect(() => {
    const scroller = sidebarRef.current
    const item = scroller?.querySelector('[aria-current="page"]')
    if (!item) return
    const box = scroller.getBoundingClientRect()
    const row = item.getBoundingClientRect()
    if (row.bottom > box.bottom) scroller.scrollTop += row.bottom - box.bottom + SIDEBAR_SCROLL_MARGIN
    else if (row.top < box.top) scroller.scrollTop -= box.top - row.top + SIDEBAR_SCROLL_MARGIN
  }, [activeId])

  const nav = (onNavigate) => (
    <>
      <AdminSidebarNav groups={groups} attention={attention} counts={counts} activeId={activeId} onNavigate={onNavigate} />
      <AdminShellActions canBackup={canBackup} onNavigate={onNavigate} />
    </>
  )

  return (
    <ToastProvider>
      <Header
        adminMenu={hasNav ? (
          <AdminMenuButton
            attention={attention}
            total={total}
            expanded={drawerOpen}
            onClick={() => setDrawerPath(pathname)}
          />
        ) : null}
      />
      <div className="mx-auto w-full max-w-(--admin-shell-max) px-4 py-6 md:px-8 xl:flex xl:items-stretch xl:gap-(--admin-shell-gap) xl:py-8">
        {/* הסרגל במחשב: דביק מתחת לכותרת העליונה, עם גלילה פנימית משלו כשהוא ארוך מהמסך */}
        {hasNav && (
          <aside className="hidden w-(--admin-sidebar-width) shrink-0 xl:block">
            <div ref={sidebarRef} className="scrollbar-thin sticky top-(--admin-sidebar-top) max-h-[calc(100dvh-var(--admin-sidebar-top)-var(--spacing)*5)] overflow-y-auto overscroll-contain rounded-(--card-radius) bg-surface p-2">
              <p className={AREA_LABEL}>ניהול</p>
              {nav(undefined)}
            </div>
          </aside>
        )}

        <main id="main-content" className="min-w-0 flex-1">
          <div className="min-h-(--admin-content-min-height)">{children}</div>
        </main>

        {drawerOpen && (
          <AdminDrawer title="ניהול" onClose={closeDrawer}>
            {nav(closeDrawer)}
          </AdminDrawer>
        )}
      </div>
    </ToastProvider>
  )
}

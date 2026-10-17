'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { MAIN_NAV_LINKS } from '@/lib/navigation-constants'
import { FOCUS_RING, FOCUS_RING_INSET } from '@/components/ui/focusRing'
import { useDisclosureMenu } from '@/hooks/useDisclosureMenu'
import HeaderLogo from './HeaderLogo'
import AccountActions from './AccountActions'
import NavDropdown from './NavDropdown'
import DonationButton, { DonationNote } from './DonationButton'

/**
 * קישור ניווט בכותרת.
 *
 * prefetch={false} במכוון: התפריט מוצג בכל דף, פעמיים (דסקטופ + מובייל), ולכן
 * ברירת המחדל של Next גררה בקשות RSC כפולות-משולשות לכל מסלול בתפריט מיד עם
 * טעינת הדף — כולל חבילות ה-JavaScript שלהם. ברשת איטית הן מתחרות בנכסים
 * שהמסך הנוכחי צריך.
 *
 * מסלולים חיצוניים (כמו /forum, שאינו מסלול Next ומחזיר redirect) מקבלים <a>
 * רגיל, כדי שלא ינסו ניווט צד-לקוח או prefetch של RSC שאינו קיים.
 */
function NavLink({ link, className, onClick, current, children }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {children}
      </a>
    )
  }

  return (
    <Link href={link.href} prefetch={false} className={className} onClick={onClick} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  )
}

/** קישור בתפריט הנייד */
function MobileNavLink({ link, pathname, onNavigate }) {
  const isActive = pathname === link.href
  return (
    <NavLink
      link={link}
      onClick={onNavigate}
      current={isActive}
      className={`rounded-lg px-3 py-3 text-base font-medium hover:bg-card-selected ${FOCUS_RING_INSET} ${
        isActive ? 'text-primary' : 'text-on-surface'
      }`}
    >
      {link.label}
    </NavLink>
  )
}

/**
 * אזור התחברות/חשבון בכותרת — אותו רכיב כמו בכותרת הספרייה (AccountActions); כאן ההתחברות
 * חוזרת לדף הנוכחי וההתנתקות משאירה את המשתמש בו.
 */
function AuthActions({ pathname, compact = false, onNavigate }) {
  const { data: session, status } = useSession()
  const actions = (
    <AccountActions
      session={session}
      status={status}
      compact={compact}
      onNavigate={onNavigate}
      loginCallbackUrl={pathname}
      signOutCallbackUrl={pathname}
    />
  )
  // בתפריט הנייד — מופרד מהקישורים בקו, כמו בתפריט הנייד של הספרייה
  return compact ? <div className="mt-2 border-t border-outline-variant px-3 pt-3">{actions}</div> : actions
}

/**
 * הכותרת העליונה הדביקה, משותפת לכל העמודים.
 *
 * מיקום הניווט קבוע בכל העמודים ובכל המצבים: רשת של שלוש עמודות (לוגו | ניווט | פעולות),
 * והניווט ממורכז בעמודה האמצעית — כך שרוחב הלוגו (גם בזמן החלפת הגופן) ורוחב אזור הפעולות לא
 * מזיזים אותו — גם לא בין דף בלי אזור חשבון לדף איתו (העמודה האמצעית ממורכזת בשורה).
 * showAuth — אזור החשבון ("התחבר" / כפתור החשבון), רק בחנות התוספים (plugins/layout), כמו
 *   ב-master. כשהוא מוצג — ברוחב קבוע (--account-slot-width) בכל מצב: טוען, אורח, מחובר.
 *   בלעדיו (דף הבית ודפי השיווק) אין מקום שמור — לא נשאר רווח ריק ליד כפתור התרומות.
 * התפריט הנייד — useDisclosureMenu (כמו בכותרת הספרייה): Esc ולחיצה בחוץ סוגרים, Esc מחזיר את
 *   הפוקוס לכפתור, aria-controls, ונסגר גם במעבר נתיב שלא עבר דרכו (חזרה בדפדפן בחנות, שם
 *   הכותרת חיה ב-layout ולא נטענת מחדש).
 * wordmarkHandoff — דף הבית בלבד: הלוגו קבוע, ושם האתר נכנס כשהמילה "אוצריא" שבכותרת הראשית
 * של הגיבור נגללת אל מתחת לכותרת (HeaderLogo).
 */
export default function OtzariaSoftwareHeader({ showAuth = false, wordmarkHandoff = false }) {
  const pathname = usePathname()
  const menu = useDisclosureMenu(pathname)
  const donationLink = MAIN_NAV_LINKS.find(link => link.emphasis === 'donation')
  const navLinks = MAIN_NAV_LINKS.filter(link => link.emphasis !== 'donation')

  // כותרת בסגנון ה-topBar של האפליקציה: רקע surfaceContainerHigh אטום, בלי זכוכית ובלי קו
  // תחתון — הרקע השונה מהדף מספיק כדי להפריד. כשהדף נגלל מתחתיה מופיע צל רך (.site-header
  // ב-animations.css, מקושר לגלילה בלי JS), כדי שהתוכן ייראה עובר מתחת לה ולא נחתך בה.
  return (
    <header className="site-header sticky top-0 z-(--z-sticky) w-full bg-top-bar">
      <div className="container mx-auto grid h-16 max-w-[76rem] 2xl:max-w-[84rem] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 md:px-8">
        <div className="col-start-1 flex justify-self-start">
          <HeaderLogo handoff={wordmarkHandoff} />
        </div>

        {/* Desktop Nav */}
        <nav aria-label="ראשי" className="col-start-2 hidden lg:flex items-center gap-1 whitespace-nowrap">
          {navLinks.map(link => {
            if (link.children) return <NavDropdown key={link.label} label={link.label} items={link.children} />
            const isActive = pathname === link.href
            return (
              <NavLink
                key={link.label}
                link={link}
                current={isActive}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${FOCUS_RING} ${
                  link.highlight
                    ? 'bg-secondary-container text-on-secondary-container hover:bg-tile/70'
                    : isActive
                      ? 'bg-card-selected text-primary'
                      : 'text-on-surface-variant hover:bg-card-selected hover:text-on-surface'
                }`}
              >
                {link.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="col-start-3 flex items-center gap-2 justify-self-end">
          {donationLink && <DonationButton link={donationLink} />}
          {showAuth && (
            <div className="hidden lg:block">
              <AuthActions pathname={pathname} />
            </div>
          )}

          <button
            type="button"
            {...menu.buttonProps}
            aria-label="תפריט"
            className={`lg:hidden flex h-12 w-12 items-center justify-center rounded-lg text-on-surface hover:bg-card-selected ${FOCUS_RING}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-2xl">{menu.isOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      {/* התפריט הנייד: נשאר ב-DOM כשהוא סגור (hidden), כדי ש-aria-controls יצביע תמיד על אלמנט
          קיים. top-full — צמוד לתחתית הכותרת בכל גובה שלה. גבוה מהמסך בנייד נמוך (הקבוצה
          המקוננת) — נגלל בתוך עצמו, לא דרך הדף. */}
      <nav
        {...menu.panelProps}
        aria-label="ראשי"
        hidden={!menu.isOpen}
        className="lg:hidden absolute top-full inset-x-0 max-h-[calc(100svh-var(--site-header-height))] overflow-y-auto overscroll-contain bg-top-bar p-3 shadow-overlay"
      >
        <div className="flex flex-col gap-0.5">
          {navLinks.map(link => link.children ? (
            // פריט נפתח (NavDropdown בדסקטופ) — כאן קבוצה פתוחה: כותרת, ומתחתיה הקישורים
            <div key={link.label} role="group" aria-labelledby={`mobile-nav-${link.href}`}>
              <div id={`mobile-nav-${link.href}`} className="mobile-nav-group-label">{link.label}</div>
              <div className="mobile-nav-group-list flex flex-col gap-0.5">
                {link.children.map(child => (
                  <MobileNavLink key={child.href + child.label} link={child} pathname={pathname} onNavigate={menu.close} />
                ))}
              </div>
            </div>
          ) : (
            <MobileNavLink key={link.label} link={link} pathname={pathname} onNavigate={menu.close} />
          ))}
          {donationLink && <DonationNote link={donationLink} onNavigate={menu.close} />}
          {showAuth && <AuthActions pathname={pathname} compact onNavigate={menu.close} />}
        </div>
      </nav>
    </header>
  )
}

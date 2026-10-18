'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import AppIcon from '@/components/ui/AppIcon'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import { useDisclosureMenu } from '@/hooks/useDisclosureMenu'
import { accountButtonLabel, accountButtonTitle, accountMenuLinks, unreadMessagesLabel, userInitial } from '@/lib/accountMenu'

/** העיגול עם האות הראשונה — בצבעי הפלטה (primary / on-primary), לא בצבע אקראי לפי השם */
function Initial({ name, className }) {
  const initial = userInitial(name)
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center rounded-full font-bold leading-none', className)}
    >
      {initial ?? <AppIcon name="person" className="text-[1.1em]" />}
    </span>
  )
}

/** מונה ההודעות על הכפתור (הטקסט לקורא המסך — בשם הנגיש של הכפתור) */
function UnreadDot({ count }) {
  if (!count) return null
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-xs font-bold text-on-error"
    >
      {count}
    </span>
  )
}

/**
 * כפתור החשבון בשורת הכותרת: עיגול האות הראשונה וחץ קטן, ברוחב קבוע לגמרי — בלי השם.
 * שם שמופיע בכותרת רק אחרי שה-session נטען משנה את רוחב השורה (או נחתך, או משאיר רווח מוזר
 * לשם קצר), ולכן השם והאימייל נמצאים בתפריט שנפתח, ב-title (ריחוף) וב-aria-label.
 */
function AccountMenuButton({ name, email, unreadMessages, buttonProps }) {
  return (
    <button
      type="button"
      {...buttonProps}
      aria-label={accountButtonLabel(name, unreadMessages)}
      title={accountButtonTitle(name, email)}
      data-account-button=""
      // ברוחב אזור החשבון בדיוק (כמו "התחבר" וה-skeleton) — לא תלוי בשם. iconOnly: בלי ריפוד צד
      // של כפתור טקסט — התוכן (עיגול + gap + חץ) ממורכז, והריפוד שווה בשני הצדדים
      className={cx(buttonClasses({ variant: 'tonal', size: 'header', iconOnly: true }), 'group w-(--account-slot-width) shrink-0')}
    >
      <Initial name={name} className="size-7 bg-primary text-on-primary text-[0.8rem]" />
      {/* החץ: תיבה ריבועית קבועה (leading-none) — ממורכז אנכית בדיוק בקו האמצע של העיגול;
          מתהפך כשהתפריט פתוח (aria-expanded), בלי מעבר ב-reduced-motion */}
      <AppIcon
        name="expand_more"
        className="flex size-5 items-center justify-center text-[1.25rem] leading-none transition-transform duration-(--motion-duration-fast) ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
      />
      <UnreadDot count={unreadMessages} />
    </button>
  )
}

/**
 * תוכן התפריט: שם ואימייל, הקישורים (האזור האישי, ניהול למורשים) והתנתקות.
 * משמש גם בתפריט הנפתח בכותרת וגם בתוך התפריט הנייד (inline). המראה — של NavDropdown
 * (.nav-dropdown-item ב-styles/nav.css), כדי ששני התפריטים בכותרת ייראו אותו דבר.
 */
export function AccountMenuItems({ user, unreadMessages = 0, signOutCallbackUrl, onNavigate }) {
  const links = accountMenuLinks(user?.role, unreadMessages)
  return (
    <>
      {/* ראש התפריט: האות (באותו עמוד כמו אייקוני הפריטים שמתחת — אותו ריפוד, אותו רוחב) ולצדה
          שתי שורות מיושרות לאותו צד: השם, ומתחתיו האימייל. האימייל LTR (dir="ltr") אבל מיושר
          לימין כמו השם (text-right: ה-start של התפריט, שהוא תמיד RTL — לא של הכתובת), ונחתך בסופו. */}
      <div className="mb-1.5 flex items-center gap-3 rounded-lg bg-surface-container-low px-3 py-2.5">
        <Initial name={user?.name} className="size-8 bg-primary text-on-primary text-sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-on-surface" title={user?.name || undefined}>
            {user?.name || 'החשבון שלי'}
          </div>
          {user?.email && (
            <div dir="ltr" title={user.email} className="truncate text-right text-xs text-on-surface-variant">
              {user.email}
            </div>
          )}
        </div>
      </div>
      <ul className="flex flex-col">
        {links.map(link => (
          <li key={link.href}>
            <Link href={link.href} prefetch={false} onClick={onNavigate} data-account-menu-item="" className="nav-dropdown-item">
              <AppIcon name={link.icon} className="nav-dropdown-icon" />
              <span className="flex-1">{link.label}</span>
              {link.badge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-xs font-bold text-on-error">
                  <span aria-hidden="true">{link.badge}</span>
                  <span className="sr-only">{unreadMessagesLabel(link.badge)}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            data-account-menu-item=""
            onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
            className="nav-dropdown-item w-full text-start"
          >
            <AppIcon name="logout" className="nav-dropdown-icon" />
            <span className="flex-1">התנתק</span>
          </button>
        </li>
      </ul>
    </>
  )
}

/**
 * כפתור החשבון בשורת הכותרת, ותפריט נפתח (disclosure: aria-expanded/aria-controls, Esc
 * מחזיר פוקוס לכפתור, לחיצה בחוץ סוגרת — useDisclosureMenu; חיצים למעלה/למטה בין הפריטים).
 * מחליף את עיגול האווטאר הצבעוני ואת "ניהול"/"התנתק" שהיו בשורה עצמה — כך רוחב אזור החשבון
 * קבוע, ושום פריט בשורה לא זז כשהמשתמש מתחבר.
 */
export default function AccountMenu({ user, unreadMessages = 0, signOutCallbackUrl }) {
  const pathname = usePathname()
  const menu = useDisclosureMenu(pathname)

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = Array.from(menu.panelProps.ref.current?.querySelectorAll('[data-account-menu-item]') ?? [])
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = index === -1 ? (step === 1 ? 0 : items.length - 1) : (index + step + items.length) % items.length
    if (menu.isOpen) {
      items[next].focus()
    } else {
      // הפאנל מוסתר (hidden) עד הרינדור הבא — הפוקוס אחרי שהוא נפתח
      menu.toggle()
      requestAnimationFrame(() => items[next]?.focus())
    }
  }

  return (
    <div
      className="relative w-full"
      onKeyDown={onKeyDown}
      // Tab שיוצא מהכפתור ומהתפריט אל רכיב אחר — סוגר (כמו NavDropdown). relatedTarget ריק
      // (לחיצה על אזור לא-פוקוסבילי, גם בתוך התפריט) — לא; לחיצה בחוץ נסגרת ב-useDisclosureMenu
      onBlur={(event) => {
        const next = event.relatedTarget
        if (menu.isOpen && next && !event.currentTarget.contains(next)) menu.close()
      }}
    >
      <AccountMenuButton
        name={user?.name}
        email={user?.email}
        unreadMessages={unreadMessages}
        buttonProps={menu.buttonProps}
      />
      <div {...menu.panelProps} hidden={!menu.isOpen} className="absolute end-0 top-full z-(--z-raised) pt-2">
        <div className="nav-dropdown-list">
          <AccountMenuItems
            user={user}
            unreadMessages={unreadMessages}
            signOutCallbackUrl={signOutCallbackUrl}
            onNavigate={menu.close}
          />
        </div>
      </div>
    </div>
  )
}

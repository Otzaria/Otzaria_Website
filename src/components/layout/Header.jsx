'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { LIBRARY_NAV_LINKS } from '@/lib/navigation-constants'
import { useState, useEffect } from 'react'
import { apiGet } from '@/lib/api-utils'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { useDisclosureMenu } from '@/hooks/useDisclosureMenu'
import AccountActions from './AccountActions'
import LibraryMobileMenu, { LibraryMenuButton } from './LibraryMobileMenu'

export default function Header() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [unreadMessages, setUnreadMessages] = useState(0)
  const menu = useDisclosureMenu(pathname)

  const role = session?.user?.role

  useEffect(() => {
    if (role === 'admin' || role === 'admin_plugins' || role === 'admin_books') {
      const loadUnreadCount = async () => {
        try {
          // מונה בלבד — בעבר נמשך כאן כל תור ההודעות (/api/messages?allMessages=true,
          // מאות KB עד MB) בכל דף ובכל דקה, רק כדי לספור את ה-unread בדפדפן.
          const result = await apiGet('/api/messages/unread-count')
          if (result.success) {
            setUnreadMessages(result.count)
          }
        } catch (error) {
          console.error('Error loading messages:', error)
        }
      }
      loadUnreadCount()
      const interval = setInterval(loadUnreadCount, 60000)
      return () => clearInterval(interval)
    }
  }, [role])

  // הרקע מגיע מ-glass-strong (--color-background ב-95%, effects.css) — טוקן סמנטי שמתחלף בערכה
  // הכהה. ה-bg-white/80 שהיה כאן לא חל בפועל (glass-strong גובר עליו), ולכן הוסר בלי שינוי חזותי.
  return (
    <header className="sticky top-0 z-(--z-sticky) w-full glass-strong border-b border-neutral-200 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between px-2 sm:px-3 md:px-4 xl:px-8">
        {/* קישור הלוגו מופיע בכל דף ואינו מצדיק prefetch */}
        <Link href="/library" prefetch={false} className={`flex items-center gap-2 lg:gap-3 rounded-lg hover:opacity-80 transition-opacity ${FOCUS_RING}`}>
          <Image src="/logo.webp" alt="לוגו אוצריא" width={32} height={32} />
          <span className="text-lg xl:text-xl font-bold text-foreground font-frank">ספריית אוצריא</span>
        </Link>

        <nav aria-label="ניווט הספרייה" className="hidden md:flex items-center gap-3 lg:gap-4 xl:gap-6">
          {/* prefetch={false}: תשעה קישורי ניווט שמופיעים בכל דף בספרייה. ברירת
              המחדל של Next הורידה את ה-RSC ואת חבילות ה-JavaScript של כולם מיד. */}
          {LIBRARY_NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={`rounded text-foreground hover:text-primary transition-colors font-medium ${FOCUS_RING}`}
            >
              {link.label}
            </Link>
          ))}

          <AccountActions session={session} status={status} unreadMessages={unreadMessages} />
        </nav>

        <LibraryMenuButton isOpen={menu.isOpen} buttonProps={menu.buttonProps} />
      </div>

      <LibraryMobileMenu
        isOpen={menu.isOpen}
        panelProps={menu.panelProps}
        pathname={pathname}
        session={session}
        status={status}
        unreadMessages={unreadMessages}
        onNavigate={menu.close}
      />
    </header>
  )
}

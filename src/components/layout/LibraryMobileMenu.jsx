'use client'

import Link from 'next/link'
import { LIBRARY_NAV_LINKS } from '@/lib/navigation-constants'
import { FOCUS_RING, FOCUS_RING_INSET } from '@/components/ui/focusRing'
import AccountActions from './AccountActions'

/**
 * כפתור התפריט בנייד (md:hidden). buttonProps מ-useDisclosureMenu: aria-expanded, aria-controls, onClick.
 */
export function LibraryMenuButton({ isOpen, buttonProps }) {
  return (
    <button
      type="button"
      {...buttonProps}
      aria-label="תפריט"
      className={`md:hidden flex h-12 w-12 items-center justify-center rounded-lg text-on-surface hover:bg-card-selected ${FOCUS_RING}`}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-3xl">{isOpen ? 'close' : 'menu'}</span>
    </button>
  )
}

/**
 * התפריט הנייד של כותרת הספרייה — אותם קישורים כמו בשורת הניווט במחשב, ומתחתם אזור החשבון.
 * נשאר ב-DOM כשהוא סגור (hidden), כדי ש-aria-controls של הכפתור יצביע תמיד על אלמנט קיים.
 * בנייד נמוך הוא גבוה מהמסך — נגלל בתוך עצמו (max-h + overflow), לא דרך הדף.
 */
export default function LibraryMobileMenu({ isOpen, panelProps, pathname, session, status, unreadMessages, onNavigate }) {
  return (
    <nav
      {...panelProps}
      aria-label="ניווט הספרייה"
      hidden={!isOpen}
      className="md:hidden absolute top-(--site-header-height) inset-x-0 max-h-[calc(100svh-var(--site-header-height))] overflow-y-auto overscroll-contain border-b border-neutral-200 bg-background p-3 shadow-overlay"
    >
      <ul className="flex flex-col gap-0.5">
        {LIBRARY_NAV_LINKS.map(link => {
          const isActive = pathname === link.href
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                prefetch={false}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium hover:bg-card-selected ${FOCUS_RING_INSET} ${
                  isActive ? 'text-primary' : 'text-on-surface'
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-xl">{link.icon}</span>
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 border-t border-neutral-200 px-3 pt-3">
        <AccountActions session={session} status={status} unreadMessages={unreadMessages} compact onNavigate={onNavigate} />
      </div>
    </nav>
  )
}

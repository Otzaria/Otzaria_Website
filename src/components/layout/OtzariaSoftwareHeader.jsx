'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { MAIN_NAV_LINKS } from '@/lib/navigation-constants'

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
function NavLink({ link, className, onClick, children }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {children}
      </a>
    )
  }

  return (
    <Link href={link.href} prefetch={false} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}

export default function OtzariaSoftwareHeader() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full glass-strong border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
        {/* קישור הלוגו מופיע בכל דף ואינו מצדיק prefetch */}
        <Link href="/" prefetch={false} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image src="/logo.webp" alt="לוגו אוצריא" width={32} height={32} />
          <span className="text-xl font-bold text-foreground font-frank">אוצריא</span>
        </Link>
        
        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {MAIN_NAV_LINKS.map(link => {
            const isDonationLink = link.emphasis === 'donation'

            return (
              <NavLink
                key={link.label}
                link={link}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  pathname === link.href && !isDonationLink ? 'text-primary font-bold' : 'text-foreground/80'
                } ${link.highlight ? 'bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20' : ''} ${
                  isDonationLink ? 'donation-nav-link' : ''
                }`}
              >
                {isDonationLink && (
                  <span className="material-symbols-outlined donation-nav-icon" aria-hidden="true">
                    {link.icon}
                  </span>
                )}
                {link.label}
              </NavLink>
            )
          })}
        </nav>
        
        {/* Mobile Menu Button */}
        <button 
          className="md:hidden p-2 text-foreground"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <span className="material-symbols-outlined text-3xl">menu</span>
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-white border-b border-neutral-200 shadow-lg p-4 flex flex-col gap-4">
          {MAIN_NAV_LINKS.map(link => {
            const isDonationLink = link.emphasis === 'donation'

            return (
              <NavLink
                key={link.label}
                link={link}
                onClick={() => setIsMenuOpen(false)}
                className={`text-lg font-medium p-2 hover:bg-neutral-50 rounded-lg text-foreground ${
                  isDonationLink ? 'donation-nav-link' : ''
                }`}
              >
                {isDonationLink && (
                  <span className="material-symbols-outlined donation-nav-icon" aria-hidden="true">
                    {link.icon}
                  </span>
                )}
                {link.label}
              </NavLink>
            )
          })}
        </div>
      )}
    </header>
  )
}

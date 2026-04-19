'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { MAIN_NAV_LINKS } from '@/lib/navigation-constants'

export default function OtzariaSoftwareHeader() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full glass-strong border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image src="/logo.svg" alt="לוגו אוצריא" width={32} height={32} />
          <span className="text-xl font-bold text-foreground font-frank">אוצריא</span>
        </Link>
        
        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {MAIN_NAV_LINKS.map(link => (
            <Link
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === link.href ? 'text-primary font-bold' : 'text-foreground/80'
              } ${link.highlight ? 'bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20' : ''}`}
            >
              {link.label}
            </Link>
          ))}
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
        <div className="md:hidden absolute top-16 left-0 w-full bg-white border-b border-gray-200 shadow-lg p-4 flex flex-col gap-4">
          {MAIN_NAV_LINKS.map(link => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className="text-lg font-medium p-2 hover:bg-gray-50 rounded-lg text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
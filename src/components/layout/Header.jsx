'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'
import { LIBRARY_NAV_LINKS } from '@/lib/navigation-constants'
import { hasAnyAdminAccess } from '@/lib/roles'
import { useState, useEffect } from 'react'

export default function Header() {
  const { data: session } = useSession()
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    const role = session?.user?.role
    if (role === 'admin' || role === 'admin_plugins' || role === 'admin_books') {
      const loadUnreadCount = async () => {
        try {
          // תיקון נתיב: messages/list -> messages
          const response = await fetch('/api/messages?allMessages=true')
          const result = await response.json()
          if (result.success) {
            const unread = result.messages.filter(m => m.status === 'unread').length
            setUnreadMessages(unread)
          }
        } catch (error) {
          console.error('Error loading messages:', error)
        }
      }
      loadUnreadCount()
      const interval = setInterval(loadUnreadCount, 60000)
      return () => clearInterval(interval)
    }
  }, [session])

  return (
    <header className="sticky top-0 z-50 w-full glass-strong border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between px-2 sm:px-3 md:px-4 xl:px-8">
        <Link href="/library" className="flex items-center gap-2 lg:gap-3 hover:opacity-80 transition-opacity">
          <Image src="/logo.webp" alt="לוגו אוצריא" width={32} height={32} />
          <span className="text-lg xl:text-xl font-bold text-foreground font-frank">ספריית אוצריא</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-3 lg:gap-4 xl:gap-6">
          {/* prefetch={false}: תשעה קישורי ניווט שמופיעים בכל דף בספרייה. ברירת
              המחדל של Next הורידה את ה-RSC ואת חבילות ה-JavaScript של כולם מיד. */}
          {LIBRARY_NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              {link.label}
            </Link>
          ))}
          
          {session ? (
            <div className="flex items-center gap-2 lg:gap-3 xl:gap-4">
              {hasAnyAdminAccess(session.user.role) && (
                <Link href="/library/admin" className="flex items-center gap-2 text-accent hover:text-accent/80 transition-colors relative font-medium">
                  <span className="material-symbols-outlined">admin_panel_settings</span>
                  <span>ניהול</span>
                  {unreadMessages > 0 && (
                    <span className="absolute -top-2 -left-2 bg-danger-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadMessages}
                    </span>
                  )}
                </Link>
              )}
              <Link 
                href="/library/dashboard" 
                className="flex items-center justify-center hover:opacity-80 transition-opacity"
                title={session.user.name}
              >
                <div 
                  className="w-9 h-9 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-md hover:shadow-lg transition-shadow"
                  style={{ backgroundColor: getAvatarColor(session.user.name) }}
                >
                  {getInitial(session.user.name)}
                </div>
              </Link>
              <button 
                onClick={() => signOut({ callbackUrl: '/library/auth/login' })}
                className="flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors text-sm font-medium"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                <span>התנתק</span>
              </button>
            </div>
          ) : (
            <Link href="/library/auth/login" className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-sm font-medium">
              <span className="material-symbols-outlined text-lg">login</span>
              <span>התחבר</span>
            </Link>
          )}
        </nav>
        
        {/* Mobile Menu Button - Placeholder */}
        <button className="md:hidden text-foreground p-2">
          <span className="material-symbols-outlined text-3xl">menu</span>
        </button>
      </div>
    </header>
  )
}

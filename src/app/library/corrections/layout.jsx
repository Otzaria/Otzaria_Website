'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Header from '@/components/layout/Header'
import { canManageCorrections } from '@/lib/roles'

export default function CorrectionsLayout({ children }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const tabs = [
    { href: '/library/corrections', label: 'תור הדיווחים', icon: 'checklist' },
    ...(canManageCorrections(session?.user) ? [{ href: '/library/corrections/admin', label: 'ניהול ובריאות', icon: 'analytics' }] : []),
  ]
  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header />
      <main className="flex-1">
        <div className="w-full px-4 md:px-6 py-8">
          <div className="w-full max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h1 className="text-3xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-accent">spellcheck</span>
                תיקוני טקסט
              </h1>
              <nav className="flex gap-2">
                {tabs.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${pathname === t.href ? 'bg-primary text-on-primary' : 'glass text-on-surface hover:bg-surface-variant'}`}
                  >
                    <span className="material-symbols-outlined">{t.icon}</span>
                    {t.label}
                  </Link>
                ))}
              </nav>
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

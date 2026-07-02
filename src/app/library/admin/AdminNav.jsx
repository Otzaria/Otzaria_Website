'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'

const ALL_TABS = [
  { id: 'dashboard', label: 'דשבורד', icon: 'analytics', href: '/library/admin', roles: ['admin', 'admin_books', 'admin_plugins', 'admin_books_only'] },
  { id: 'users', label: 'משתמשים', icon: 'group', href: '/library/admin/users', roles: ['admin'] },
  { id: 'books', label: 'ספרים', icon: 'menu_book', href: '/library/admin/books', roles: ['admin', 'admin_books', 'admin_books_only'] },
  { id: 'dicta-books', label: 'ספרי דיקטה', icon: 'edit_document', href: '/library/admin/dicta-books', roles: ['admin', 'admin_books'] },
  { id: 'uploads', label: 'העלאות', icon: 'upload_file', href: '/library/admin/uploads', roles: ['admin', 'admin_books'] },
  { id: 'plugins', label: 'תוספים', icon: 'extension', href: '/library/admin/plugins', roles: ['admin', 'admin_plugins'] },
  { id: 'pages', label: 'עמודים', icon: 'description', href: '/library/admin/pages-management', roles: ['admin', 'admin_books'] },
  { id: 'messages', label: 'הודעות', icon: 'mail', href: '/library/admin/messages', roles: ['admin', 'admin_plugins', 'admin_books'] },
  { id: 'reminders', label: 'תזכורות', icon: 'notifications', href: '/library/admin/reminders', roles: ['admin', 'admin_books'] },
  { id: 'dictionary', label: 'מילון', icon: 'spellcheck', href: '/library/admin/dictionary', roles: ['admin', 'admin_books'] },
  { id: 'book-info', label: 'מידע על ספרים', icon: 'list_alt', href: '/library/admin/book-info', roles: ['admin', 'admin_books'] },
  { id: 'book-acronyms', label: 'כינויים ור"ת', icon: 'dictionary', href: '/library/admin/book-acronyms', roles: ['admin', 'admin_books'] },
]

export default function AdminNav({ unreadMessagesCount = 0, pendingUploadsCount = 0, pendingPluginsCount = 0 }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.role

  const tabs = ALL_TABS
    .filter(tab => tab.roles.includes(role))
    .map(tab => {
      if (tab.id === 'uploads' && pendingUploadsCount > 0)
        return { ...tab, label: `העלאות (${pendingUploadsCount})` }
      if (tab.id === 'plugins') return { ...tab, count: pendingPluginsCount }
      if (tab.id === 'messages') return { ...tab, count: unreadMessagesCount }
      return tab
    })

  return (
    <div className="flex w-full max-w-full flex-wrap justify-center gap-2 mb-6 overflow-visible p-3">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap relative group shrink-0 text-center ${
              isActive
                ? 'bg-primary text-on-primary'
                : 'glass text-on-surface hover:bg-surface-variant'
            }`}
          >
            {tab.count > 0 && (
              <span className="absolute -top-2 -left-2 bg-danger-600 text-white text-[10px] font-bold min-w-[20px] h-[20px] flex items-center justify-center rounded-full border-2 border-white shadow-sm z-10">
                {tab.count}
              </span>
            )}

            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined">{tab.icon}</span>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

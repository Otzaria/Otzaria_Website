'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AdminNav({ unreadMessagesCount = 0, pendingUploadsCount = 0 }) {
  const pathname = usePathname()

  const tabs = [
    { id: 'dashboard', label: 'דשבורד', icon: 'analytics', href: '/library/admin' },
    { id: 'users', label: 'משתמשים', icon: 'group', href: '/library/admin/users' },
    { id: 'books', label: 'ספרים', icon: 'menu_book', href: '/library/admin/books' },
    { 
      id: 'uploads', 
      label: `העלאות ${pendingUploadsCount > 0 ? `(${pendingUploadsCount})` : ''}`, 
      icon: 'upload_file', 
      href: '/library/admin/uploads' 
    },
    { id: 'pages', label: 'עמודים', icon: 'description', href: '/library/admin/pages-management' },
    { 
      id: 'messages', 
      label: `הודעות ${unreadMessagesCount > 0 ? `(${unreadMessagesCount})` : ''}`, 
      icon: 'mail', 
      href: '/library/admin/messages' 
    },
  ]

  return (
    <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`px-6 py-3 rounded-lg font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-primary text-on-primary'
                : 'glass text-on-surface hover:bg-surface-variant'
            }`}
          >
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
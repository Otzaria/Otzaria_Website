'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AdminNav({ unreadMessagesCount = 0, pendingUploadsCount = 0 }) {
  const pathname = usePathname()

  const tabs = [
    { id: 'dashboard', label: 'דשבורד', icon: 'analytics', href: '/library/admin' },
    { id: 'users', label: 'משתמשים', icon: 'group', href: '/library/admin/users' },
    { id: 'books', label: 'ספרים', icon: 'menu_book', href: '/library/admin/books' },
    { id: 'dicta-books', label: 'ספרי דיקטה', icon: 'edit_document', href: '/library/admin/dicta-books' },
    { id: 'dictionary', label: 'מילון', icon: 'spellcheck', href: '/library/admin/dictionary' },
    { 
      id: 'uploads', 
      label: `העלאות ${pendingUploadsCount > 0 ? `(${pendingUploadsCount})` : ''}`, 
      icon: 'upload_file', 
      href: '/library/admin/uploads' 
    },
    { id: 'pages', label: 'עמודים', icon: 'description', href: '/library/admin/pages-management' },
    { 
      id: 'messages', 
      label: 'הודעות', 
      icon: 'mail', 
      href: '/library/admin/messages',
      count: unreadMessagesCount 
    },
    { id: 'reminders', label: 'תזכורות', icon: 'notifications', href: '/library/admin/reminders' },
  ]

  return (
    <div className="flex gap-2 mb-6 overflow-x-auto p-3 custom-scrollbar">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`px-6 py-3 rounded-lg font-medium transition-all whitespace-nowrap relative group ${
              isActive
                ? 'bg-primary text-on-primary'
                : 'glass text-on-surface hover:bg-surface-variant'
            }`}
          >
            {tab.count > 0 && (
              <span className="absolute -top-2 -left-2 bg-red-600 text-white text-[10px] font-bold min-w-[20px] h-[20px] flex items-center justify-center rounded-full border-2 border-white shadow-sm z-10">
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

'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import AdminNav from './AdminNav'

export default function AdminLayout({ children }) {
  const { data: session } = useSession()
  const [counts, setCounts] = useState({ unreadMessages: 0, pendingUploads: 0 })

  // טעינת מוניטורים גלובליים לטאבים
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [msgRes, uploadRes] = await Promise.all([
            fetch('/api/messages'),
            fetch('/api/admin/uploads/list')
        ])
        
        const msgData = await msgRes.json()
        const uploadData = await uploadRes.json()

        setCounts({
            unreadMessages: msgData.success ? msgData.messages.filter(m => m.status === 'unread').length : 0,
            pendingUploads: uploadData.success ? uploadData.uploads.filter(u => u.status === 'pending').length : 0
        })
      } catch (e) {
        console.error('Error loading admin counts', e)
      }
    }

    fetchCounts()
    // רענון כל דקה
    const interval = setInterval(fetchCounts, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-7xl mx-auto">
            {/* כותרת ראשית משותפת */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-bold text-on-surface flex items-center gap-3">
                  <span className="material-symbols-outlined text-5xl text-accent">
                    admin_panel_settings
                  </span>
                  פאנל ניהול
                </h1>
                <p className="text-on-surface/60 mt-2">ניהול מלא של המערכת</p>
              </div>
              <div className="flex gap-3">
                {session?.user?.name === 'admin' && (
                  <a
                    href="/api/admin/export-backup"
                    download
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <span className="material-symbols-outlined">download</span>
                    <span>גיבוי מלא</span>
                  </a>
                )}
                <Link
                  href="/library/dashboard"
                  className="flex items-center gap-2 px-4 py-2 glass rounded-lg hover:bg-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined">arrow_forward</span>
                  <span>חזרה לדשבורד</span>
                </Link>
              </div>
            </div>

            {/* תפריט ניווט */}
            <AdminNav 
                unreadMessagesCount={counts.unreadMessages} 
                pendingUploadsCount={counts.pendingUploads} 
            />

            {/* תוכן העמוד הספציפי */}
            <div className="min-h-[500px]">
                {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
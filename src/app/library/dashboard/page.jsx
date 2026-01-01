'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import ChangePasswordForm from '@/components/ChangePasswordForm'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState({
    myPages: 0,
    completedPages: 0,
    inProgressPages: 0,
    points: 0,
    recentActivity: []
  })
  const [loading, setLoading] = useState(true)
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [messageSubject, setMessageSubject] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [myMessages, setMyMessages] = useState([])
  const [showMyMessages, setShowMyMessages] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/library/auth/login')
    } else if (status === 'authenticated') {
      loadUserStats()
      loadMyMessages()
    }
  }, [status, router])

  const loadUserStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/user/stats')
      const result = await response.json()
      
      if (result.success) {
        setStats({
          myPages: result.stats?.myPages || 0,
          completedPages: result.stats?.completedPages || 0,
          inProgressPages: result.stats?.inProgressPages || 0,
          points: result.stats?.points || 0,
          // התיקון כאן: הנתונים נמצאים בתוך result.stats.recentActivity ולא ב-result.recentActivity
          recentActivity: result.stats?.recentActivity || []
        })
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMyMessages = async () => {
    try {
      const response = await fetch('/api/messages')
      const result = await response.json()
      
      if (result.success) {
        setMyMessages(result.messages)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  const handleSendMessage = async () => {
    if (!messageSubject.trim() || !messageText.trim()) {
      alert('נא למלא את כל השדות')
      return
    }

    try {
      setSendingMessage(true)
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: messageSubject,
          content: messageText,
          recipientId: null // null מסמן הודעה למנהלים
        })
      })

      const result = await response.json()
      if (result.success) {
        alert('ההודעה נשלחה בהצלחה למנהלים!')
        setMessageSubject('')
        setMessageText('')
        setShowMessageForm(false)
        loadMyMessages()
      } else {
        alert(result.error || 'שגיאה בשליחת הודעה')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      alert('שגיאה בשליחת הודעה')
    } finally {
      setSendingMessage(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-6xl text-primary">
          progress_activity
        </span>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const isAdmin = session.user.role === 'admin'

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-2 text-on-surface">
            שלום, {session.user.name}!
          </h1>
          <p className="text-on-surface/70 mb-8">
            ברוך הבא לאיזור האישי שלך
          </p>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-5xl text-blue-600">
                  edit_note
                </span>
                <div>
                  <p className="text-3xl font-bold text-on-surface">
                    {loading ? '...' : stats.inProgressPages}
                  </p>
                  <p className="text-on-surface/70">עמודים בטיפול</p>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-5xl text-green-600">
                  check_circle
                </span>
                <div>
                  <p className="text-3xl font-bold text-on-surface">
                    {loading ? '...' : stats.completedPages}
                  </p>
                  <p className="text-on-surface/70">עמודים שהושלמו</p>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-5xl text-primary">
                  description
                </span>
                <div>
                  <p className="text-3xl font-bold text-on-surface">
                    {loading ? '...' : stats.myPages}
                  </p>
                  <p className="text-on-surface/70">סה"כ עמודים שלי</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass-strong p-8 rounded-2xl mb-8">
            <h2 className="text-2xl font-bold mb-6 text-on-surface">פעולות מהירות</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/library/books" className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all">
                <span className="material-symbols-outlined text-4xl text-primary">library_books</span>
                <span className="font-medium text-on-surface">הספרייה</span>
              </Link>

              <Link href="/library/upload" className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all">
                <span className="material-symbols-outlined text-4xl text-primary">upload_file</span>
                <span className="font-medium text-on-surface">שליחת ספרים</span>
              </Link>

              <button 
                onClick={() => setShowMessageForm(true)}
                className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined text-4xl text-primary">mail</span>
                <span className="font-medium text-on-surface">שלח הודעה למנהלים</span>
              </button>

              <button 
                onClick={() => setShowMyMessages(true)}
                className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all relative"
              >
                <span className="material-symbols-outlined text-4xl text-primary">inbox</span>
                <span className="font-medium text-on-surface">ההודעות שלי</span>
                {myMessages.filter(m => m.status === 'replied' && m.senderId === session?.user?.id).length > 0 && (
                  <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                    {myMessages.filter(m => m.status === 'replied' && m.senderId === session?.user?.id).length}
                  </span>
                )}
              </button>

              {isAdmin && (
                <Link href="/library/admin" className="flex flex-col items-center gap-3 p-6 bg-accent/20 rounded-xl hover:bg-accent/30 transition-all">
                  <span className="material-symbols-outlined text-4xl text-accent">admin_panel_settings</span>
                  <span className="font-medium text-on-surface">פאנל ניהול</span>
                </Link>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="glass-strong p-8 rounded-2xl mb-8">
            <h2 className="text-2xl font-bold mb-6 text-on-surface">העמודים שלי</h2>
            {loading ? (
              <div className="text-center py-8">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                  progress_activity
                </span>
              </div>
            ) : stats.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-4">
                {stats.recentActivity.map((activity) => (
                  <div key={`${activity.bookName}-${activity.pageNumber}`} className="flex items-center gap-4 p-4 bg-surface rounded-lg">
                    <span className={`material-symbols-outlined ${
                      activity.status === 'completed' ? 'text-green-600' : 'text-blue-600'
                    }`}>
                      {activity.status === 'completed' ? 'check_circle' : 'edit_note'}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-on-surface">
                        {activity.bookName} - עמוד {activity.pageNumber}
                      </p>
                      <p className="text-sm text-on-surface/60">
                        {activity.status === 'completed' ? 'הושלם' : 'בטיפול'} • {activity.date}
                      </p>
                    </div>
                    {/* כאן התיקון לנתיב הלינק */}
                    <Link 
                      href={`/library/book/${activity.bookPath}`}
                      className="text-primary hover:text-accent"
                    >
                      <span className="material-symbols-outlined">arrow_back</span>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-6xl text-on-surface/20 mb-4 block">
                  description
                </span>
                <p className="text-on-surface/60">עדיין לא תפסת עמודים לעריכה</p>
                <Link 
                  href="/library/books"
                  className="inline-flex items-center gap-2 mt-4 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors"
                >
                  <span className="material-symbols-outlined">library_books</span>
                  <span>עבור לספרייה</span>
                </Link>
              </div>
            )}
          </div>

          {/* Change Password Section */}
          <ChangePasswordForm />
        </div>
      </div>

      {/* My Messages Modal */}
      {showMyMessages && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-strong p-8 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl text-primary">inbox</span>
                ההודעות שלי
              </h3>
              <button
                onClick={() => setShowMyMessages(false)}
                className="p-2 hover:bg-surface-variant rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface">close</span>
              </button>
            </div>

            {myMessages.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-6xl text-on-surface/30 mb-4">
                  inbox
                </span>
                <p className="text-on-surface/60">אין הודעות עדיין</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myMessages.map(message => (
                  <div key={message.id} className="glass p-6 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-xl font-bold text-on-surface mb-1">{message.subject}</h4>
                        <p className="text-sm text-on-surface/60">
                          {new Date(message.createdAt).toLocaleDateString('he-IL', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        message.status === 'replied' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {message.status === 'replied' ? 'נענה' : 'נשלח'}
                      </span>
                    </div>
                    
                    <p className="text-on-surface whitespace-pre-wrap mb-4">{message.content}</p>

                    {message.replies && message.replies.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-surface-variant">
                        <h5 className="font-bold text-on-surface mb-3 flex items-center gap-2">
                          <span className="material-symbols-outlined text-green-600">reply</span>
                          תגובות מהמנהלים:
                        </h5>
                        <div className="space-y-3">
                          {message.replies.map((reply, idx) => (
                            <div key={idx} className="bg-green-50 p-4 rounded-lg">
                              <p className="text-sm text-on-surface/60 mb-2">
                                <span className="font-medium">{reply.senderName || 'מנהל'}</span>
                                <span className="mx-2">•</span>
                                {new Date(reply.createdAt).toLocaleDateString('he-IL', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                              <p className="text-on-surface whitespace-pre-wrap">{reply.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message Modal */}
      {showMessageForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-strong p-8 rounded-2xl max-w-2xl w-full">
            <h3 className="text-2xl font-bold mb-6 text-on-surface flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-primary">mail</span>
              שלח הודעה למנהלים
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">נושא</label>
                <input
                  type="text"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  placeholder="נושא ההודעה..."
                  className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface"
                  disabled={sendingMessage}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">הודעה</label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="כתוב את ההודעה שלך כאן..."
                  className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface"
                  rows="8"
                  disabled={sendingMessage}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">send</span>
                <span>{sendingMessage ? 'שולח...' : 'שלח הודעה'}</span>
              </button>
              <button
                onClick={() => {
                  setShowMessageForm(false)
                  setMessageSubject('')
                  setMessageText('')
                }}
                disabled={sendingMessage}
                className="px-6 py-3 glass rounded-lg hover:bg-surface-variant transition-colors disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
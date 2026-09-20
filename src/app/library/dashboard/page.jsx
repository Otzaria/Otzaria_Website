'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { canHandleCorrections } from '@/lib/roles'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import Pagination from '@/components/ui/Pagination'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PasswordChangeModal from '@/components/dashboard/PasswordChangeModal'
import EmailChangeModal from '@/components/dashboard/EmailChangeModal'
import SubscriptionReminderModal from '@/components/dashboard/SubscriptionReminderModal'
import NotificationSubscriptionModal from '@/components/dashboard/NotificationSubscriptionModal'
import MyMessagesModal from '@/components/dashboard/MyMessagesModal'

export default function DashboardPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  
  const [stats, setStats] = useState({
    myPages: 0,
    completedPages: 0,
    inProgressPages: 0,
    myDictaBooks: 0,
    completedDictaBooks: 0,
    inProgressDictaBooks: 0,
    points: 0,
    recentActivity: [],
    recentDictaBooks: []
  })
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const [currentDictaPage, setCurrentDictaPage] = useState(1)
  const itemsPerPage = 10

  const [showMessageForm, setShowMessageForm] = useState(false)
  const [messageSubject, setMessageSubject] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  const [myMessages, setMyMessages] = useState([])
  const [showMyMessages, setShowMyMessages] = useState(false)

  const [showNotifModal, setShowNotifModal] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loadingSub, setLoadingSub] = useState(false)

  const [showEmailModal, setShowEmailModal] = useState(false)

  const [showReminderModal, setShowReminderModal] = useState(false)

  const [showPasswordModal, setShowPasswordModal] = useState(false)

  useEffect(() => {
      update();
    // הרצה חד-פעמית בעליה; update מוחרג
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    } else if (status === 'authenticated') {
      const isFirstTime = stats.myPages === 0 && stats.recentActivity.length === 0;
      loadUserStats(isFirstTime);
      loadMyMessages();
      checkSubscriptionReminder();
    }
  // טעינה מותנית-הרשאה; קריאת stats היא snapshot מכוון
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router, session]);

  const loadUserStats = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) setLoading(true);
      const response = await fetch('/api/user/stats');
      const result = await response.json();
      
      if (result.success) {
        setStats({
          myPages: result.stats?.myPages || 0,
          completedPages: result.stats?.completedPages || 0,
          inProgressPages: result.stats?.inProgressPages || 0,
          myDictaBooks: result.stats?.myDictaBooks || 0,
          completedDictaBooks: result.stats?.completedDictaBooks || 0,
          inProgressDictaBooks: result.stats?.inProgressDictaBooks || 0,
          points: result.stats?.points || 0,
          recentActivity: result.stats?.recentActivity || [],
          recentDictaBooks: result.stats?.recentDictaBooks || []
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyMessages = async () => {
    try {
      const response = await fetch('/api/messages', { cache: 'no-store' })
      const result = await response.json()
      
      if (result.success) {
        setMyMessages(result.messages)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  const checkSubscriptionStatus = async () => {
    try {
      setLoadingSub(true)
      const response = await fetch('/api/user/notifications')
      const data = await response.json()
      if (data.success) {
        setIsSubscribed(data.isSubscribed)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingSub(false)
    }
  }

  const checkSubscriptionReminder = async () => {
    try {
      const response = await fetch('/api/user/notifications');
      const data = await response.json();
      
      if (data.success) {
        setIsSubscribed(data.isSubscribed);

        if (data.isSubscribed) return;

        const lastDismissed = data.lastDismissedAt ? new Date(data.lastDismissedAt) : null;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        if (!lastDismissed || lastDismissed < oneWeekAgo) {
            setShowReminderModal(true);
        }
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  }

  const toggleSubscription = async () => {
    try {
      setLoadingSub(true)
      const response = await fetch('/api/user/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isSubscribed ? 'unsubscribe' : 'subscribe' })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setIsSubscribed(!isSubscribed)
        showAlert(
            'הצלחה', 
            !isSubscribed ? 'נרשמת בהצלחה לקבלת התראות!' : 'הסרת את הרישום מההתראות.'
        );
        setShowNotifModal(false);
      } else {
        showAlert('שגיאה', 'שגיאה בביצוע הפעולה');
      }
    } catch (error) {
      showAlert('שגיאה', 'שגיאה בתקשורת');
    } finally {
      setLoadingSub(false)
    }
  }

  useEffect(() => {
    if (showNotifModal) {
      checkSubscriptionStatus()
    }
  }, [showNotifModal])

  const handleSendMessage = async () => {
    if (!messageSubject.trim() || !messageText.trim()) {
      showAlert('שגיאה', 'נא למלא את כל השדות')
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
          recipientId: null 
        })
      })

      const result = await response.json()
      if (result.success) {
        showAlert('הצלחה', 'ההודעה נשלחה בהצלחה למנהלים')
        setMessageSubject('')
        setMessageText('')
        setShowMessageForm(false)
        loadMyMessages()
      } else {
        showAlert('שגיאה', result.error || 'שגיאה בשליחת הודעה')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      showAlert('שגיאה', 'שגיאה בשליחת הודעה')
    } finally {
      setSendingMessage(false)
    }
  }

  const isReadByUser = (message) => {
    const userId = session?.user?._id || session?.user?.id;
    if (message.readBy && Array.isArray(message.readBy)) {
        return message.readBy.includes(userId);
    }
    return message.isRead;
  };

  const markMessagesAsRead = async (messages) => {
      const unreadMessagesIds = messages
          .filter(m => !isReadByUser(m))
          .map(m => m.id);

      if (unreadMessagesIds.length === 0) return;

      try {
          await fetch('/api/messages', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageIds: unreadMessagesIds })
          });
      } catch (error) {
          console.error('Failed to mark messages as read:', error);
      }
  };

  const handleCloseMessages = () => {
    setShowMyMessages(false);
    loadMyMessages();
  };

  useEffect(() => {
      if (showMyMessages && myMessages.length > 0) {
          markMessagesAsRead(myMessages);
      }
  // markMessagesAsRead מוחרג; רץ רק לפי נראות הודעות
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMyMessages, myMessages]);

  const unreadCount = myMessages.filter(m => {
      // sender=null בהודעת מערכת
      const amISender = m.sender?._id === session?.user?.id || m.sender === session?.user?.id;
      if (amISender) {
          return m.status === 'replied' && !isReadByUser(m);
      }
      return !isReadByUser(m);
  }).length;

  const sortedActivity = [...stats.recentActivity].sort((a, b) => {
    return (a.status === 'completed') - (b.status === 'completed');
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedActivity.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedActivity.length / itemsPerPage);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner message="טוען..." size="lg" />
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

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-5xl text-info-600">
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
                <span className="material-symbols-outlined text-5xl text-success-600">
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
                  <p className="text-on-surface/70">סה״כ עמודים שלי</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-5xl text-info-600">
                  menu_book
                </span>
                <div>
                  <p className="text-3xl font-bold text-on-surface">
                    {loading ? '...' : stats.inProgressDictaBooks}
                  </p>
                  <p className="text-on-surface/70">ספרי דיקטה בטיפול</p>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-5xl text-success-600">
                  task_alt
                </span>
                <div>
                  <p className="text-3xl font-bold text-on-surface">
                    {loading ? '...' : stats.completedDictaBooks}
                  </p>
                  <p className="text-on-surface/70">ספרי דיקטה שהושלמו</p>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-5xl text-primary">
                  auto_stories
                </span>
                <div>
                  <p className="text-3xl font-bold text-on-surface">
                    {loading ? '...' : stats.myDictaBooks}
                  </p>
                  <p className="text-on-surface/70">סה״כ ספרי דיקטה שלי</p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-strong p-8 rounded-2xl mb-8">
            <h2 className="text-2xl font-bold mb-6 text-on-surface">פעולות מהירות</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/library/books" className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all">
                <span className="material-symbols-outlined text-4xl text-primary">library_books</span>
                <span className="font-medium text-on-surface">הספרייה</span>
              </Link>
              
              {/* כפתור חדש - הספרים שלי */}
              <Link href="/library/dashboard/my-uploads" className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all">
                <span className="material-symbols-outlined text-4xl text-primary">menu_book</span>
                <span className="font-medium text-on-surface">הספרים שלי</span>
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
  
                {unreadCount > 0 && (
                  <span className="absolute top-2 left-2 bg-danger-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              <button 
                onClick={() => setShowNotifModal(true)}
                className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined text-4xl text-primary">campaign</span>
                <span className="font-medium text-on-surface">התראות על ספרים חדשים</span>
              </button>

              <button
                onClick={() => setShowEmailModal(true)}
                className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined text-4xl text-primary">manage_accounts</span>
                <span className="font-medium text-on-surface">עדכון כתובת מייל</span>
              </button>

              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined text-4xl text-primary">lock_reset</span>
                <span className="font-medium text-on-surface">
                  {session?.user?.hasPassword === false ? 'קביעת סיסמה' : 'שינוי סיסמה'}
                </span>
              </button>

              {canHandleCorrections(session?.user) && (
                <Link href="/library/corrections" className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all">
                  <span className="material-symbols-outlined text-4xl text-primary">spellcheck</span>
                  <span className="font-medium text-on-surface">תיקוני טקסט</span>
                </Link>
              )}

              {isAdmin && (
                <Link href="/library/admin" className="flex flex-col items-center gap-3 p-6 bg-accent/20 rounded-xl hover:bg-accent/30 transition-all">
                  <span className="material-symbols-outlined text-4xl text-accent">admin_panel_settings</span>
                  <span className="font-medium text-on-surface">פאנל ניהול</span>
                </Link>
              )}
            </div>
          </div>

          <div className="glass-strong p-8 rounded-2xl mb-8">
            <h2 className="text-2xl font-bold mb-6 text-on-surface">העמודים שלי</h2>
            {loading ? (
              <LoadingSpinner message="" size="sm" />
            ) : stats.recentActivity && stats.recentActivity.length > 0 ? (
              <>
                <div className="space-y-4">
                  {currentItems.map((activity) => (
                    <div key={`${activity.bookName}-${activity.pageNumber}`} className="flex items-center gap-4 p-4 bg-surface rounded-lg">
                      <span className={`material-symbols-outlined ${
                        activity.status === 'completed' ? 'text-success-600' : 'text-info-600'
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
                      {activity.bookPath && activity.bookPath !== '#' && activity.pageNumber !== null && activity.pageNumber !== undefined ? (
                        <Link 
                          href={`/library/books/${encodeURIComponent(activity.bookPath)}/${activity.pageNumber}`}
                          className="text-primary hover:text-accent"
                        >
                          <span className="material-symbols-outlined">arrow_back</span>
                        </Link>
                      ) : (
                        <span className="text-on-surface/30 cursor-not-allowed" title="לא ניתן לפתוח עמוד זה (ספר חסר)">
                          <span className="material-symbols-outlined">arrow_back</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <Pagination 
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </>
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

          <div className="glass-strong p-8 rounded-2xl mb-8">
            <h2 className="text-2xl font-bold mb-6 text-on-surface">ספרי הדיקטה שלי</h2>
            {loading ? (
              <LoadingSpinner message="" size="sm" />
            ) : stats.recentDictaBooks && stats.recentDictaBooks.length > 0 ? (
              <>
                <div className="space-y-4">
                  {(() => {
                    const sortedDictaBooks = [...stats.recentDictaBooks].sort((a, b) => {
                      return (a.status === 'completed') - (b.status === 'completed');
                    });
                    const indexOfLastDictaItem = currentDictaPage * itemsPerPage;
                    const indexOfFirstDictaItem = indexOfLastDictaItem - itemsPerPage;
                    const currentDictaItems = sortedDictaBooks.slice(indexOfFirstDictaItem, indexOfLastDictaItem);
                    const totalDictaPages = Math.ceil(sortedDictaBooks.length / itemsPerPage);

                    return (
                      <>
                        {currentDictaItems.map((book) => (
                          <div key={book.id} className="flex items-center gap-4 p-4 bg-surface rounded-lg">
                            <span className={`material-symbols-outlined ${
                              book.status === 'completed' ? 'text-success-600' : 'text-info-600'
                            }`}>
                              {book.status === 'completed' ? 'task_alt' : 'menu_book'}
                            </span>
                            <div className="flex-1">
                              <p className="font-medium text-on-surface">
                                {book.bookName}
                              </p>
                              <p className="text-sm text-on-surface/60">
                                {book.status === 'completed' ? 'הושלם' : 'בטיפול'} • {book.date}
                              </p>
                            </div>
                            <Link 
                              href={`/library/dicta-books/edit/${book.bookId}`}
                              className="text-primary hover:text-accent"
                            >
                              <span className="material-symbols-outlined">arrow_back</span>
                            </Link>
                          </div>
                        ))}

                        <Pagination 
                          currentPage={currentDictaPage}
                          totalPages={totalDictaPages}
                          onPageChange={setCurrentDictaPage}
                        />
                      </>
                    );
                  })()}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-6xl text-on-surface/20 mb-4 block">
                  auto_stories
                </span>
                <p className="text-on-surface/60">עדיין לא תפסת ספרי דיקטה לעריכה</p>
                <Link 
                  href="/library/dicta-books"
                  className="inline-flex items-center gap-2 mt-4 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors"
                >
                  <span className="material-symbols-outlined">auto_stories</span>
                  <span>עבור לספרי דיקטה</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {showEmailModal && (
        <EmailChangeModal
          onClose={() => setShowEmailModal(false)}
          currentEmail={session?.user?.email}
          showAlert={showAlert}
          showConfirm={showConfirm}
          updateSession={update}
        />
      )}

      {showPasswordModal && (
        <PasswordChangeModal
          hasPassword={session?.user?.hasPassword !== false}
          onClose={() => setShowPasswordModal(false)}
          showAlert={showAlert}
        />
      )}

      {showMyMessages && (
        <MyMessagesModal
          messages={myMessages}
          isReadByUser={isReadByUser}
          currentUserId={session?.user?._id || session?.user?.id}
          onClose={handleCloseMessages}
          onMessagesChanged={loadMyMessages}
          showAlert={showAlert}
        />
      )}
      
      {showNotifModal && (
        <NotificationSubscriptionModal
          onClose={() => setShowNotifModal(false)}
          toggleSubscription={toggleSubscription}
          isSubscribed={isSubscribed}
          loadingSub={loadingSub}
        />
      )}

      {showReminderModal && (
        <SubscriptionReminderModal
          onClose={() => setShowReminderModal(false)}
          toggleSubscription={toggleSubscription}
          loadingSub={loadingSub}
        />
      )}

      {showMessageForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-surface-variant bg-white/50 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl text-primary">mail</span>
                שלח הודעה למנהלים
              </h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">נושא</label>
                <input
                  type="text"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  placeholder="נושא ההודעה..."
                  className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                  disabled={sendingMessage}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">הודעה</label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="כתוב את ההודעה שלך כאן..."
                  className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm resize-none"
                  rows="8"
                  disabled={sendingMessage}
                />
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-surface-variant bg-neutral-50/50 rounded-b-2xl">
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-md hover:-translate-y-0.5"
              >
                {sendingMessage ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                    <span>שולח...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-xl">send</span>
                    <span>שלח הודעה</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowMessageForm(false)
                  setMessageSubject('')
                  setMessageText('')
                }}
                disabled={sendingMessage}
                className="px-6 py-3 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50 font-medium"
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

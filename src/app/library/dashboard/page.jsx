'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import Pagination from '@/components/ui/Pagination'
import { validatePassword, validateMatch, validateDifferent } from '@/lib/validation-utils'

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
  const [replyingToMessageId, setReplyingToMessageId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const [showNotifModal, setShowNotifModal] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loadingSub, setLoadingSub] = useState(false)

  const [showEmailModal, setShowEmailModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [updatingEmail, setUpdatingEmail] = useState(false)


  const [showReminderModal, setShowReminderModal] = useState(false)
  const [dismissingReminder, setDismissingReminder] = useState(false)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })

  useEffect(() => {
      update();
    // הרצה חד-פעמית בעליה; update מוחרג
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    } else if (status === 'authenticated') {
      const isFirstTime = stats.myPages === 0 && stats.recentActivity.length === 0;
      loadUserStats(isFirstTime); 
      loadMyMessages();
      setNewEmail(session?.user?.email || '');
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

  const handleDismissReminderServerSide = async () => {
    try {
        setDismissingReminder(true);
        const response = await fetch('/api/user/notifications/dismiss', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            setShowReminderModal(false);
        } else {
            setShowReminderModal(false);
        }
    } catch (error) {
        console.error('Error dismissing reminder:', error);
        setShowReminderModal(false);
    } finally {
        setDismissingReminder(false);
    }
  };

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

  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
        showAlert('שגיאה', 'נא להזין כתובת מייל תקינה');
        return;
    }
    
    if (newEmail === session?.user?.email) {
        setShowEmailModal(false);
        return;
    }

    setUpdatingEmail(true);

    try {
        const res = await fetch('/api/auth/update-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: newEmail })
        });
        const data = await res.json();

        if (res.ok) {
            await update();
            showAlert('הצלחה', 'כתובת המייל עודכנה בהצלחה!');
            setShowEmailModal(false);
        } else {
            showAlert('שגיאה', data.error || 'שגיאה בעדכון המייל');
        }
    } catch (error) {
        showAlert('שגיאה', 'שגיאת תקשורת');
    } finally {
        setUpdatingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMessage({ type: '', text: '' })

    if (!passwordFormData.currentPassword || !passwordFormData.newPassword || !passwordFormData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'נא למלא את כל השדות' })
      return
    }

    const passwordCheck = validatePassword(passwordFormData.newPassword, 8)
    if (!passwordCheck.isValid) {
      setPasswordMessage({ type: 'error', text: passwordCheck.error })
      return
    }

    const matchCheck = validateMatch(passwordFormData.newPassword, passwordFormData.confirmPassword, 'הסיסמאות החדשות')
    if (!matchCheck.isValid) {
      setPasswordMessage({ type: 'error', text: matchCheck.error })
      return
    }

    const differentCheck = validateDifferent(passwordFormData.currentPassword, passwordFormData.newPassword, 'הסיסמה החדשה')
    if (!differentCheck.isValid) {
      setPasswordMessage({ type: 'error', text: differentCheck.error })
      return
    }

    try {
      setLoadingPassword(true)
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordFormData.currentPassword,
          newPassword: passwordFormData.newPassword
        })
      })

      const result = await response.json()

      if (response.ok) {
        showAlert('הצלחה', 'הסיסמה שונתה בהצלחה!')
        setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' })
        setShowPasswordModal(false)
      } else {
        setPasswordMessage({ type: 'error', text: result.error || 'שגיאה בשינוי הסיסמה' })
      }
    } catch (error) {
      setPasswordMessage({ type: 'error', text: 'שגיאה בתקשורת' })
    } finally {
      setLoadingPassword(false)
    }
  }

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

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

  const handleSendReply = async (messageId) => {
    if (!replyText.trim()) {
      showAlert('שגיאה', 'נא לכתוב תגובה')
      return
    }

    try {
      setSendingReply(true)
      const response = await fetch('/api/messages/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, reply: replyText })
      })

      const result = await response.json()
      if (result.success) {
        showAlert('הצלחה', 'התגובה נשלחה בהצלחה')
        setReplyText('')
        setReplyingToMessageId(null)
        loadMyMessages()
      } else {
        showAlert('שגיאה', result.error || 'שגיאה בשליחת התגובה')
      }
    } catch (error) {
      console.error('Error sending reply:', error)
      showAlert('שגיאה', 'שגיאה בשליחת התגובה')
    } finally {
      setSendingReply(false)
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

  const getReplySenderDisplayName = (reply) => {
    const currentUserId = session?.user?._id || session?.user?.id
    const replySenderId = reply?.sender
    if (currentUserId && replySenderId && String(currentUserId) === String(replySenderId)) {
      return 'אתה'
    }
    if (reply?.senderRole === 'admin') {
      return reply?.senderName || 'מנהל'
    }
    return reply?.senderName || 'משתמש'
  }

  const sortedActivity = [...stats.recentActivity].sort((a, b) => {
    return (a.status === 'completed') - (b.status === 'completed');
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedActivity.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedActivity.length / itemsPerPage);

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
                onClick={() => {
                    setNewEmail(session?.user?.email || '');
                    setShowEmailModal(true);
                }}
                className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined text-4xl text-primary">manage_accounts</span>
                <span className="font-medium text-on-surface">עדכון כתובת מייל</span>
              </button>

              <button
                onClick={() => {
                    setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    setPasswordMessage({ type: '', text: '' });
                    setShowPasswords({ current: false, new: false, confirm: false });
                    setShowPasswordModal(true);
                }}
                className="flex flex-col items-center gap-3 p-6 bg-primary-container rounded-xl hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined text-4xl text-primary">lock_reset</span>
                <span className="font-medium text-on-surface">שינוי סיסמה</span>
              </button>

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
              <div className="text-center py-8">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                  progress_activity
                </span>
              </div>
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
              <div className="text-center py-8">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                  progress_activity
                </span>
              </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-surface-variant bg-white/50 rounded-t-2xl flex justify-between items-center">
              <h3 className="text-xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-primary">manage_accounts</span>
                עדכון כתובת מייל
              </h3>
              <button 
                onClick={() => setShowEmailModal(false)} 
                className="text-neutral-500 hover:text-neutral-800"
                disabled={updatingEmail}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
               <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">כתובת מייל נוכחית</label>
                  <div className="w-full px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-600">
                    {session?.user?.email}
                  </div>
               </div>

               <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">כתובת מייל חדשה</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="הכנס מייל חדש..."
                    className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                    disabled={updatingEmail}
                    dir="ltr"
                  />
               </div>

              <div className="flex gap-3 pt-2">
                <button
                    onClick={() => setShowEmailModal(false)}
                    disabled={updatingEmail}
                    className="flex-1 px-4 py-2 border border-surface-variant text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                >
                    ביטול
                </button>
                <button
                    onClick={() => {
                        if (!newEmail || !newEmail.includes('@')) {
                            showAlert('שגיאה', 'נא להזין כתובת מייל תקינה');
                            return;
                        }
                        if (newEmail === session?.user?.email) {
                            setShowEmailModal(false);
                            return;
                        }
                        showConfirm(
                            'עדכון כתובת מייל',
                            'שינוי כתובת המייל ידרוש ביצוע אימות מחדש לכתובת החדשה כדי להמשיך להשתמש בחשבון. האם אתה בטוח?',
                            () => handleUpdateEmail()
                        );
                    }}
                    disabled={updatingEmail || !newEmail || newEmail === session?.user?.email}
                    className="flex-[2] px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors flex items-center justify-center gap-2 font-bold shadow-md"
                >
                    {updatingEmail ? (
                    <>
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                        <span>מעדכן...</span>
                    </>
                    ) : (
                        'עדכן מייל'
                    )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-surface-variant bg-white/50 rounded-t-2xl flex justify-between items-center">
              <h3 className="text-xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-primary">lock_reset</span>
                שינוי סיסמה
              </h3>
              <button 
                onClick={() => setShowPasswordModal(false)} 
                className="text-neutral-500 hover:text-neutral-800"
                disabled={loadingPassword}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">סיסמה נוכחית</label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordFormData.currentPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, currentPassword: e.target.value })}
                    className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                    placeholder="הזן סיסמה נוכחית"
                    disabled={loadingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('current')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/60 hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-xl">
                      {showPasswords.current ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">סיסמה חדשה</label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordFormData.newPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                    className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                    placeholder="הזן סיסמה חדשה (לפחות 8 תווים)"
                    disabled={loadingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('new')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/60 hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-xl">
                      {showPasswords.new ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">אימות סיסמה חדשה</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordFormData.confirmPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                    className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                    placeholder="הזן שוב את הסיסמה החדשה"
                    disabled={loadingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('confirm')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/60 hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-xl">
                      {showPasswords.confirm ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {passwordMessage.text && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${
                  passwordMessage.type === 'success' 
                    ? 'bg-success-100 text-success-800 border border-success-300' 
                    : 'bg-danger-100 text-danger-800 border border-danger-300'
                }`}>
                  <span className="material-symbols-outlined">
                    {passwordMessage.type === 'success' ? 'check_circle' : 'error'}
                  </span>
                  <span>{passwordMessage.text}</span>
                </div>
              )}

              <div className="p-4 bg-primary-container/30 rounded-lg">
                <p className="text-sm text-on-surface/70 flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-lg">info</span>
                  <span>
                    <strong>טיפ אבטחה:</strong> השתמש בסיסמה חזקה המכילה אותיות, מספרים ותווים מיוחדים. 
                    אל תשתמש באותה סיסמה באתרים שונים.
                  </span>
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                    onClick={() => setShowPasswordModal(false)}
                    disabled={loadingPassword}
                    className="flex-1 px-4 py-2 border border-surface-variant text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                >
                    ביטול
                </button>
                <button
                    onClick={handleChangePassword}
                    disabled={loadingPassword}
                    className="flex-[2] px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors flex items-center justify-center gap-2 font-bold shadow-md"
                >
                    {loadingPassword ? (
                    <>
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                        <span>משנה סיסמה...</span>
                    </>
                    ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">lock_reset</span>
                          <span>שנה סיסמה</span>
                        </>
                    )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMyMessages && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleCloseMessages}
        >
          <div
            className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-surface-variant flex items-center justify-between flex-shrink-0 bg-white/50 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl text-primary">inbox</span>
                ההודעות שלי
              </h3>
              <button
                onClick={handleCloseMessages}
                className="p-2 hover:bg-surface-variant rounded-full transition-colors"
              >
                <span className="material-symbols-outlined text-2xl block text-on-surface">close</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              {myMessages.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-6xl text-on-surface/30 mb-4">
                    inbox
                  </span>
                  <p className="text-on-surface/60">אין הודעות עדיין</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myMessages.map(message => {
                    const isUnread = !isReadByUser(message);
                    return (
                      <div 
                        key={message.id} 
                        className={`glass p-6 rounded-lg border transition-colors duration-300 ${
                          isUnread 
                            ? 'bg-danger-50 border-danger-200 shadow-sm' 
                            : 'border-surface-variant'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-xl font-bold text-on-surface mb-1 flex items-center gap-2">
                                {message.subject}
                                {isUnread && (
                                    <span className="inline-block w-2 h-2 rounded-full bg-danger-500 animate-pulse"></span>
                                )}
                            </h4>
                            <p className="text-sm text-on-surface/60">
                              {message.messageType === 'system' && (
                                <>
                                  <span className="font-medium text-primary">{message.senderName || 'מערכת אוצריא'}</span>
                                  <span className="mx-2">•</span>
                                </>
                              )}
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
                              ? 'bg-success-100 text-success-800'
                              : 'bg-neutral-100 text-neutral-800'
                          }`}>
                            {message.status === 'replied' ? 'נענה' : 'נשלח'}
                          </span>
                        </div>
                        
                        <p className="text-on-surface whitespace-pre-wrap mb-4">{message.content}</p>

                        {message.replies && message.replies.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-surface-variant">
                            <h5 className="font-bold text-on-surface mb-3 flex items-center gap-2">
                              <span className="material-symbols-outlined text-success-600">reply</span>
                              תגובות בשרשור:
                            </h5>
                            <div className="space-y-3">
                              {message.replies.map((reply, idx) => (
                                <div
                                  key={reply?.id || idx}
                                  className={`${reply?.senderRole === 'admin' ? 'bg-success-50 border border-success-100' : 'bg-surface border border-surface-variant'} p-4 rounded-lg`}
                                >
                                  <p className="text-sm text-on-surface/60 mb-2">
                                    <span className="font-medium text-primary">{getReplySenderDisplayName(reply)}</span>
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

                        <div className="mt-4">
                          {message.allowReplies === false ? (
                            <p className="flex items-center gap-2 text-sm text-on-surface/50">
                              <span className="material-symbols-outlined text-lg">info</span>
                              <span>הודעת מערכת — לא ניתן להשיב</span>
                            </p>
                          ) : replyingToMessageId === message.id ? (
                            <div className="animate-in fade-in slide-in-from-top-2">
                              <textarea
                                className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-inner"
                                placeholder="כתוב תגובה..."
                                rows="4"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                disabled={sendingReply}
                                autoFocus
                              />
                              <div className="flex gap-3 mt-3 justify-end">
                                <button
                                  onClick={() => {
                                    setReplyingToMessageId(null)
                                    setReplyText('')
                                  }}
                                  disabled={sendingReply}
                                  className="px-6 py-2 glass rounded-lg hover:bg-surface-variant transition-colors disabled:opacity-50 text-sm"
                                >
                                  ביטול
                                </button>
                                <button
                                  onClick={() => handleSendReply(message.id)}
                                  disabled={sendingReply}
                                  className="flex items-center justify-center gap-2 px-6 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">send</span>
                                  <span>{sendingReply ? 'שולח...' : 'שלח תגובה'}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setReplyingToMessageId(message.id)
                                setReplyText('')
                              }}
                              className="flex items-center gap-2 px-4 py-2 glass rounded-lg hover:bg-surface-variant transition-colors text-sm font-medium border border-surface-variant"
                            >
                              <span className="material-symbols-outlined text-lg">reply</span>
                              <span>השב</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {showNotifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-surface-variant bg-white/50 rounded-t-2xl flex justify-between items-center">
              <h3 className="text-xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-primary">notifications_active</span>
                התראות על ספרים חדשים
              </h3>
              <button onClick={() => setShowNotifModal(false)} className="text-neutral-500 hover:text-neutral-800">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-8 text-center space-y-6">
              <div className={`inline-flex items-center justify-center p-4 rounded-full ${isSubscribed ? 'bg-success-100' : 'bg-neutral-100'}`}>
                <span className={`material-symbols-outlined text-5xl ${isSubscribed ? 'text-success-600' : 'text-neutral-400'}`}>
                  {isSubscribed ? 'mark_email_read' : 'mail_off'}
                </span>
              </div>

              <div>
                <p className="text-lg font-bold text-on-surface mb-2">
                  סטטוס נוכחי: 
                  <span className={isSubscribed ? 'text-success-600 mr-2' : 'text-neutral-500 mr-2'}>
                    {isSubscribed ? 'רשום לקבלת עדכונים' : 'לא רשום'}
                  </span>
                </p>
                <p className="text-sm text-on-surface/70">
                  {isSubscribed 
                    ? 'כתובת המייל שלך נמצאת ברשימת התפוצה. תקבל עדכון במייל כשספרים חדשים עולים לאתר.'
                    : 'הצטרף לרשימת התפוצה כדי לקבל עדכונים על ספרים חדשים ישירות למייל.'}
                </p>
              </div>

              <button
                onClick={toggleSubscription}
                disabled={loadingSub}
                className={`w-full py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  isSubscribed 
                    ? 'bg-danger-50 text-danger-600 border border-danger-200 hover:bg-danger-100' 
                    : 'bg-primary text-on-primary hover:bg-info-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {loadingSub ? (
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined">
                      {isSubscribed ? 'unsubscribe' : 'add_alert'}
                    </span>
                    {isSubscribed ? 'בטל קבלת התראות' : 'אשר קבלת התראות'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReminderModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-accent"></div>

            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-2">
                <span className="material-symbols-outlined text-5xl text-primary animate-pulse">
                  mark_email_unread
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-on-surface mb-3">
                  פספסת משהו...
                </h3>
                <p className="text-on-surface/80 leading-relaxed">
                  המערכת זיהתה שאינך רשום לקבלת עדכונים במייל.
                  <br />
                  רצינו להזכיר לך שכדאי להירשם כדי לא לפספס ספרים חדשים וחשובים שעולים לספרייה וזמינים לעריכה!
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <button
                  onClick={async () => {
                      await toggleSubscription(); 
                      setShowReminderModal(false);
                  }}
                  disabled={loadingSub}
                  className="w-full py-3 px-6 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark shadow-lg hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  {loadingSub ? (
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">mark_email_read</span>
                      רשום אותי עכשיו
                    </>
                  )}
                </button>

                <button
                  onClick={handleDismissReminderServerSide}
                  disabled={dismissingReminder}
                  className="w-full py-2 px-6 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl text-sm font-medium transition-colors"
                >
                  {dismissingReminder ? 'מעדכן...' : 'לא מעוניין (הזכר לי שוב בעוד שבוע)'}
                </button>
              </div>
            </div>
          </div>
        </div>
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

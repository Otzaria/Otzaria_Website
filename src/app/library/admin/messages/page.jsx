'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function AdminMessagesPage() {
  const { data: session } = useSession()
  
  // נתונים
  const [messages, setMessages] = useState([])
  const [users, setUsers] = useState([]) // רשימת משתמשים לבחירה
  const [loading, setLoading] = useState(true)
  
  // State לתגובה מהירה
  const [replyText, setReplyText] = useState('')
  const [selectedMessage, setSelectedMessage] = useState(null)
  
  // State להודעה חדשה (משוחזר מהקוד הישן)
  const [showSendMessageDialog, setShowSendMessageDialog] = useState(false)
  const [newMessageRecipient, setNewMessageRecipient] = useState('all')
  const [newMessageSubject, setNewMessageSubject] = useState('')
  const [newMessageText, setNewMessageText] = useState('')
  const [sendingNewMessage, setSendingNewMessage] = useState(false)

  // טעינת נתונים ראשונית
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // טעינת הודעות ומשתמשים במקביל
      const [msgsRes, usersRes] = await Promise.all([
        fetch('/api/messages'),
        fetch('/api/admin/users')
      ])

      const msgsData = await msgsRes.json()
      const usersData = await usersRes.json()
      
      if (msgsData.success) {
        setMessages(msgsData.messages)
      }
      
      if (usersData.success) {
        // סינון האדמין עצמו מרשימת הנמענים אם רוצים, או השארתו
        setUsers(usersData.users.filter(u => u.role !== 'admin'))
      }

    } catch (e) {
      console.error('Error loading data:', e)
    } finally {
      setLoading(false)
    }
  }

  // פונקציות עזר להודעות קיימות
  const handleReply = async (messageId) => {
      if (!replyText.trim()) return
      try {
          const res = await fetch('/api/messages/reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId, reply: replyText })
          })
          if (res.ok) {
              setReplyText('')
              setSelectedMessage(null)
              loadData() // רענון כדי לראות את הסטטוס
              alert('התגובה נשלחה בהצלחה')
          } else {
              alert('שגיאה בשליחת התגובה')
          }
      } catch (e) {
          alert('שגיאה בתקשורת')
      }
  }

  const handleMarkRead = async (id) => {
      await fetch('/api/messages/mark-read', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: id })
      })
      // עדכון לוקאלי מהיר
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'read' } : m))
  }

  const handleDelete = async (messageId) => {
      if (!confirm('למחוק לצמיתות?')) return
      await fetch('/api/messages/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId })
      })
      setMessages(prev => prev.filter(m => m.id !== messageId))
  }

  // --- לוגיקה משוחזרת לשליחת הודעה חדשה ---
  const handleSendNewMessage = async () => {
    if (!newMessageSubject.trim() || !newMessageText.trim()) {
        alert('נא למלא את כל השדות')
        return
    }

    try {
        setSendingNewMessage(true)
        const response = await fetch('/api/messages/send-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipientId: newMessageRecipient === 'all' ? null : newMessageRecipient,
                subject: newMessageSubject,
                message: newMessageText,
                sendToAll: newMessageRecipient === 'all'
            })
        })

        const result = await response.json()
        if (result.success) {
            alert(result.message)
            setNewMessageSubject('')
            setNewMessageText('')
            setNewMessageRecipient('all')
            setShowSendMessageDialog(false)
            loadData() // רענון הרשימה
        } else {
            alert(result.error || 'שגיאה בשליחת הודעה')
        }
    } catch (error) {
        console.error('Error sending message:', error)
        alert('שגיאה בשליחת הודעה')
    } finally {
        setSendingNewMessage(false)
    }
}

  return (
    <div className="glass-strong p-6 rounded-xl min-h-[600px] relative">
      {/* כותרת וכפתור הוספה */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">mail</span>
            הודעות מערכת
          </h2>
          <button 
            onClick={() => setShowSendMessageDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors shadow-sm font-medium"
          >
              <span className="material-symbols-outlined">send</span>
              <span>שלח הודעה חדשה</span>
          </button>
      </div>

      {/* רשימת הודעות */}
      {loading ? (
        <div className="flex justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        </div>
      ) : messages.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
              <span className="material-symbols-outlined text-6xl mb-2 text-gray-300">inbox</span>
              <p>אין הודעות להצגה</p>
          </div>
      ) : (
          <div className="space-y-4">
              {messages.map(message => (
                  <div key={message.id} className={`glass p-6 rounded-lg transition-all ${message.status === 'unread' ? 'border-2 border-primary shadow-md' : 'hover:shadow-md'}`}>
                      <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-xl font-bold text-on-surface">{message.subject}</h3>
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                      message.status === 'unread' 
                                      ? 'bg-blue-100 text-blue-800' 
                                      : message.status === 'replied' 
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-gray-100 text-gray-800'
                                  }`}>
                                      {message.status === 'unread' ? 'חדש' : message.status === 'replied' ? 'נענה' : 'נקרא'}
                                  </span>
                              </div>
                              <p className="text-sm text-on-surface/60 mb-3 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm">person</span>
                                  <span className="font-medium">{message.senderName}</span> 
                                  <span>({message.senderEmail})</span>
                                  <span className="mx-2">•</span> 
                                  <span>{new Date(message.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute:'2-digit' })}</span>
                              </p>
                              <div className="bg-white/50 p-3 rounded-lg border border-gray-100 text-on-surface whitespace-pre-wrap">
                                  {message.content}
                              </div>
                          </div>
                      </div>

                      {/* תגובות */}
                      {message.replies && message.replies.length > 0 && (
                          <div className="mt-4 mr-8 space-y-3 border-r-2 border-gray-200 pr-4">
                              <h4 className="font-bold text-sm text-on-surface mb-2">היסטוריית תגובות:</h4>
                              {message.replies.map((reply, idx) => (
                                  <div key={idx} className="bg-surface p-3 rounded-lg text-sm shadow-sm">
                                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                                          <span className="font-bold text-primary">{reply.senderName || 'מנהל'}</span>
                                          <span>{new Date(reply.createdAt).toLocaleDateString('he-IL')}</span>
                                      </div>
                                      <p className="text-gray-800">{reply.content}</p>
                                  </div>
                              ))}
                          </div>
                      )}

                      {/* כפתורי פעולה / אזור תגובה */}
                      {selectedMessage === message.id ? (
                          <div className="mt-4 mr-8 animate-in fade-in slide-in-from-top-2">
                              <textarea 
                                  className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface mb-3 shadow-inner"
                                  placeholder="כתוב תגובה למשתמש..."
                                  rows="4"
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  autoFocus
                              />
                              <div className="flex gap-3 justify-end">
                                  <button onClick={() => setSelectedMessage(null)} className="px-4 py-2 glass rounded-lg hover:bg-surface-variant transition-colors text-sm">
                                      ביטול
                                  </button>
                                  <button onClick={() => handleReply(message.id)} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors text-sm font-bold">
                                      <span className="material-symbols-outlined text-sm">send</span>
                                      שלח תגובה
                                  </button>
                              </div>
                          </div>
                      ) : (
                          <div className="flex gap-3 mt-4 border-t border-gray-100 pt-3">
                              <button 
                                onClick={() => setSelectedMessage(message.id)} 
                                className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium"
                              >
                                  <span className="material-symbols-outlined text-lg">reply</span>
                                  השב
                              </button>
                              {message.status === 'unread' && (
                                  <button onClick={() => handleMarkRead(message.id)} className="flex items-center gap-1 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors text-sm">
                                      <span className="material-symbols-outlined text-lg">mark_email_read</span>
                                      סמן כנקרא
                                  </button>
                              )}
                              <div className="flex-1"></div>
                              <button onClick={() => handleDelete(message.id)} className="flex items-center gap-1 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors text-sm">
                                  <span className="material-symbols-outlined text-lg">delete</span>
                                  מחק
                              </button>
                          </div>
                      )}
                  </div>
              ))}
          </div>
      )}

      {/* --- דיאלוג שליחת הודעה (עיצוב משוחזר) --- */}
      {showSendMessageDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div 
                className="glass-strong p-8 rounded-2xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
              >
                  <h3 className="text-2xl font-bold mb-6 text-on-surface flex items-center gap-3 border-b border-gray-200 pb-4">
                      <span className="material-symbols-outlined text-3xl text-primary">send</span>
                      שלח הודעה למשתמשים
                  </h3>
                  
                  <div className="space-y-5">
                      <div>
                          <label className="block text-sm font-bold text-on-surface mb-2">נמען</label>
                          <select 
                              value={newMessageRecipient}
                              onChange={(e) => setNewMessageRecipient(e.target.value)}
                              className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                              disabled={sendingNewMessage}
                          >
                              <option value="all">כל המשתמשים (הודעת מערכת)</option>
                              {users.map(user => (
                                  <option key={user._id} value={user.id}>{user.name} ({user.email})</option>
                              ))}
                          </select>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-on-surface mb-2">נושא</label>
                          <input 
                              type="text"
                              value={newMessageSubject}
                              onChange={(e) => setNewMessageSubject(e.target.value)}
                              placeholder="נושא ההודעה..."
                              className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                              disabled={sendingNewMessage}
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-bold text-on-surface mb-2">תוכן ההודעה</label>
                          <textarea 
                              value={newMessageText}
                              onChange={(e) => setNewMessageText(e.target.value)}
                              placeholder="כתוב את ההודעה שלך כאן..."
                              className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm min-h-[150px] resize-none"
                              disabled={sendingNewMessage}
                          />
                      </div>
                  </div>

                  <div className="flex gap-3 mt-8 pt-4 border-t border-gray-200">
                      <button 
                          onClick={handleSendNewMessage}
                          disabled={sendingNewMessage}
                          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-all shadow-md font-bold disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                          {sendingNewMessage ? (
                              <>
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                <span>שולח...</span>
                              </>
                          ) : (
                              <>
                                <span className="material-symbols-outlined">send</span>
                                <span>שלח הודעה</span>
                              </>
                          )}
                      </button>
                      <button 
                          onClick={() => {
                              setShowSendMessageDialog(false)
                              setNewMessageSubject('')
                              setNewMessageText('')
                              setNewMessageRecipient('all')
                          }}
                          disabled={sendingNewMessage}
                          className="px-6 py-3 glass rounded-lg hover:bg-surface-variant transition-colors font-medium border border-gray-300"
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
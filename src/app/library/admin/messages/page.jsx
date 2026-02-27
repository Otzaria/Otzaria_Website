'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useDialog } from '@/components/DialogContext'

export default function AdminMessagesPage() {
  const { data: session } = useSession()
  const { showAlert, showConfirm } = useDialog()
  
  const [messages, setMessages] = useState([])
  const [users, setUsers] = useState([]) 
  const [loading, setLoading] = useState(true)
  
  const [replyText, setReplyText] = useState('')
  const [selectedMessage, setSelectedMessage] = useState(null)
  
  const [showSendMessageDialog, setShowSendMessageDialog] = useState(false)
  const [newMessageRecipient, setNewMessageRecipient] = useState('all')
  const [newMessageSubject, setNewMessageSubject] = useState('')
  const [newMessageText, setNewMessageText] = useState('')
  const [sendingNewMessage, setSendingNewMessage] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [msgsRes, usersRes] = await Promise.all([
        fetch('/api/messages?allMessages=true'),
        fetch('/api/admin/users')
      ])

      const msgsData = await msgsRes.json()
      const usersData = await usersRes.json()
      
      if (msgsData.success) {
        const sortedMessages = [...msgsData.messages].sort((a, b) => {
          const lastTimeA = a.replies && a.replies.length > 0 
            ? new Date(a.replies[a.replies.length - 1].createdAt).getTime()
            : new Date(a.createdAt).getTime();

          const lastTimeB = b.replies && b.replies.length > 0 
            ? new Date(b.replies[b.replies.length - 1].createdAt).getTime()
            : new Date(b.createdAt).getTime();

          return lastTimeB - lastTimeA;
        });

        setMessages(sortedMessages)
      }
      
      if (usersData.success) {
        setUsers(usersData.users.filter(u => u.role !== 'admin'))
      }

    } catch (e) {
      console.error('Error loading data:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleReply = async (messageId) => {
      if (!replyText.trim()) return
      try {
          const res = await fetch('/api/messages/reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId, reply: replyText, fromAdminPanel: true })
          })
          if (res.ok) {
              setReplyText('')
              setSelectedMessage(null)
              loadData()
              showAlert('הצלחה', 'התגובה נשלחה בהצלחה')
          } else {
              showAlert('שגיאה', 'שגיאה בשליחת התגובה')
          }
      } catch (e) {
          showAlert('שגיאה', 'שגיאה בתקשורת')
      }
  }

  const handleMarkRead = async (id) => {
      await fetch('/api/messages/mark-read', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: id })
      })
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'read' } : m))
  }

  const handleDelete = async (messageId) => {
      showConfirm(
          'מחיקת הודעה',
          'האם אתה בטוח שברצונך למחוק הודעה זו לצמיתות?',
          async () => {
              await fetch('/api/messages/delete', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messageId })
              })
              setMessages(prev => prev.filter(m => m.id !== messageId))
          },
          'מחק',
          'ביטול'
      )
  }

  const handleSendNewMessage = async () => {
    if (!newMessageSubject.trim() || !newMessageText.trim()) {
        showAlert('שגיאה', 'נא למלא את כל השדות')
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
            showAlert('הצלחה', result.message)
            setNewMessageSubject('')
            setNewMessageText('')
            setNewMessageRecipient('all')
            setShowSendMessageDialog(false)
            loadData()
        } else {
            showAlert('שגיאה', result.error || 'שגיאה בשליחת הודעה')
        }
    } catch (error) {
        console.error('Error sending message:', error)
        showAlert('שגיאה', 'שגיאה בשליחת הודעה')
    } finally {
        setSendingNewMessage(false)
    }
  }

  return (
    <div className="glass-strong p-6 rounded-xl min-h-[600px] relative">
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
                  <div 
                    key={message.id} 
                    className={`p-6 rounded-lg transition-all ${
                        message.status === 'unread' 
                        ? 'bg-red-50 border-2 border-red-200 shadow-md'
                        : 'glass hover:shadow-md'
                    }`}
                  >
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

                      {message.replies && message.replies.length > 0 && (
                          <div className="mt-4 mr-8 space-y-3 border-r-2 border-gray-200 pr-4">
                              <h4 className="font-bold text-sm text-on-surface mb-2">היסטוריית תגובות:</h4>
                              {message.replies.map((reply, idx) => (
                                  <div key={idx} className="bg-surface p-3 rounded-lg text-sm shadow-sm">
                                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                                          <span className="font-bold text-primary">{reply.senderName || 'מנהל'}</span>
                                          <span>
                                            {new Date(reply.createdAt).toLocaleString('he-IL', {
                                                day: 'numeric',
                                                month: 'numeric',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                          </span>
                                      </div>
                                      <p className="text-gray-800">{reply.content}</p>
                                  </div>
                              ))}
                          </div>
                      )}

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
                              <button onClick={() => setSelectedMessage(message.id)} className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium">
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

      {showSendMessageDialog && (
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowSendMessageDialog(false)}
          >
              <div 
                className="flex flex-col bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh]"
                onClick={e => e.stopPropagation()}
              >
                  {/* Header */}
                  <div className="p-6 border-b border-gray-200 flex-shrink-0 bg-white rounded-t-2xl">
                      <h3 className="text-2xl font-bold text-on-surface flex items-center gap-3">
                          <span className="material-symbols-outlined text-3xl text-primary">send</span>
                          שלח הודעה למשתמשים
                      </h3>
                  </div>
                  
                  {/* Content */}
                  <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
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
                                  <option key={user._id} value={user._id}>{user.name} ({user.email})</option>
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

                  {/* Footer */}
                  <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex-shrink-0">
                      <button 
                          onClick={handleSendNewMessage}
                          disabled={sendingNewMessage}
                          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-all shadow-md font-bold disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5"
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
                          className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
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



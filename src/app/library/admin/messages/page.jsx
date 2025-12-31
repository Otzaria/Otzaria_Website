'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function AdminMessagesPage() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [selectedMessage, setSelectedMessage] = useState(null)
  
  // State להודעה חדשה
  const [showNewMsgDialog, setShowNewMsgDialog] = useState(false)
  const [newMsgSubject, setNewMsgSubject] = useState('')
  const [newMsgContent, setNewMsgContent] = useState('')
  const [sending, setSending] = useState(false)

  // טעינת ההודעות
  const loadMessages = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/messages')
      const data = await res.json()
      
      if (data.success && Array.isArray(data.messages)) {
        setMessages(data.messages)
      } else {
        setMessages([])
      }
    } catch (e) {
      console.error('Error loading messages:', e)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMessages()
  }, [])

  // פונקציות עזר (שליחה, מחיקה, סימון כנקרא)
  const handleReply = async (messageId) => {
      if (!replyText.trim()) return
      try {
          const res = await fetch('/api/messages/reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId, reply: replyText })
          })
          const data = await res.json()
          if (data.success) {
              setReplyText('')
              setSelectedMessage(null)
              loadMessages()
          } else {
              alert('שגיאה: ' + (data.error || 'נכשל'))
          }
      } catch (e) {
          alert('שגיאה בשליחה')
      }
  }

  const handleSendBroadcast = async () => {
      if (!newMsgSubject || !newMsgContent) return alert('נא למלא את כל השדות')
      
      try {
          setSending(true)
          const res = await fetch('/api/messages/send-admin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  subject: newMsgSubject,
                  message: newMsgContent,
                  sendToAll: true,
                  recipientId: null
              })
          })
          const data = await res.json()
          if (data.success) {
              alert(data.message)
              setShowNewMsgDialog(false)
              setNewMsgSubject('')
              setNewMsgContent('')
              loadMessages()
          } else {
              alert(data.error)
          }
      } catch (e) {
          alert('שגיאה בשליחה')
      } finally {
          setSending(false)
      }
  }

  const handleMarkRead = async (id) => {
      await fetch('/api/messages/mark-read', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: id })
      })
      loadMessages()
  }

  const handleDeleteMessage = async (messageId) => {
    if(!confirm('למחוק הודעה זו?')) return;
    try {
        await fetch('/api/messages/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId })
        })
        loadMessages()
    } catch (e) {
        console.error(e)
    }
  }

  return (
    <div className="glass-strong p-6 rounded-xl min-h-[500px] relative">
      {/* --- אזור הכותרת והכפתור (תמיד מוצג) --- */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">הודעות מערכת</h2>
            <p className="text-sm text-gray-500">צפייה וניהול פניות משתמשים</p>
          </div>
          
          <button 
            onClick={() => setShowNewMsgDialog(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow-sm transition-all font-medium"
          >
              <span className="material-symbols-outlined text-xl">send</span>
              <span>הודעה לכולם</span>
          </button>
      </div>

      {/* --- אזור התוכן (משתנה לפי טעינה) --- */}
      <div className="space-y-4">
        {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <span className="material-symbols-outlined animate-spin text-4xl mb-2 text-blue-600">progress_activity</span>
                <p>טוען הודעות...</p>
            </div>
        ) : messages.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">inbox</span>
                <p className="text-xl font-medium text-gray-600">אין הודעות להצגה</p>
                <p className="text-gray-500 text-sm mt-1">תיבת ההודעות ריקה כרגע</p>
            </div>
        ) : (
            <div className="grid gap-4">
                {messages.map(msg => (
                    <div key={msg.id} className={`bg-white p-6 rounded-xl border transition-all ${msg.status === 'unread' ? 'border-blue-500 shadow-md' : 'border-gray-200 shadow-sm hover:shadow-md'}`}>
                        {/* כותרת ההודעה */}
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <h3 className="font-bold text-lg text-gray-900">{msg.subject}</h3>
                                  {msg.status === 'unread' && (
                                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-bold">חדש</span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">person</span>
                                    <span className="font-medium">{msg.senderName || 'משתמש'}</span>
                                    <span>•</span>
                                    <span>{new Date(msg.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute:'2-digit' })}</span>
                                </div>
                            </div>
                            
                            <div className="flex gap-2">
                                {msg.status === 'unread' && (
                                    <button 
                                      onClick={() => handleMarkRead(msg.id)} 
                                      className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                                      title="סמן כנקרא"
                                    >
                                      <span className="material-symbols-outlined">mark_email_read</span>
                                    </button>
                                )}
                                <button 
                                  onClick={() => handleDeleteMessage(msg.id)} 
                                  className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                  title="מחק הודעה"
                                >
                                  <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        </div>
                        
                        {/* תוכן ההודעה */}
                        <div className="bg-gray-50 p-4 rounded-lg text-gray-800 whitespace-pre-wrap mb-4 border border-gray-100">
                          {msg.content}
                        </div>

                        {/* תגובות קודמות */}
                        {msg.replies && msg.replies.length > 0 && (
                            <div className="mb-4 pr-4 border-r-4 border-gray-200 space-y-3">
                                {msg.replies.map((r, i) => (
                                    <div key={i} className="bg-white p-3 rounded-lg border border-gray-100 text-sm shadow-sm">
                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                          <span className="font-bold text-gray-700">{r.senderName || 'מנהל'}</span>
                                          <span>{new Date(r.createdAt).toLocaleDateString('he-IL')}</span>
                                        </div>
                                        <p className="text-gray-800">{r.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* אזור תגובה */}
                        {selectedMessage === msg.id ? (
                            <div className="mt-4 bg-blue-50 p-4 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-2">
                                <label className="block text-sm font-bold text-blue-900 mb-2">תגובה למשתמש:</label>
                                <textarea 
                                  className="w-full border border-blue-200 rounded-lg p-3 mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]" 
                                  placeholder="כתוב את תגובתך כאן..."
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                    <button 
                                        onClick={() => setSelectedMessage(null)} 
                                        className="px-4 py-2 rounded-lg text-gray-600 hover:bg-white hover:shadow-sm transition-all"
                                    >
                                        ביטול
                                    </button>
                                    <button 
                                        onClick={() => handleReply(msg.id)} 
                                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-md font-medium transition-all"
                                    >
                                        שלח תגובה
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button 
                              onClick={() => setSelectedMessage(msg.id)} 
                              className="text-blue-600 hover:text-blue-800 text-sm font-bold flex items-center gap-1 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors w-fit"
                            >
                              <span className="material-symbols-outlined text-lg">reply</span>
                              השב למשתמש
                            </button>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* --- דיאלוג הודעה חדשה (Modal) --- */}
      {showNewMsgDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div 
                className="bg-white p-8 rounded-2xl max-w-lg w-full shadow-2xl transform scale-100 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-gray-800">שליחת הודעה לכל המשתמשים</h3>
                      <button onClick={() => setShowNewMsgDialog(false)} className="text-gray-400 hover:text-gray-600">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">נושא ההודעה</label>
                        <input 
                            className="w-full border border-gray-300 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            placeholder="לדוגמה: עדכון מערכת חשוב"
                            value={newMsgSubject}
                            onChange={e => setNewMsgSubject(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">תוכן ההודעה</label>
                        <textarea 
                            className="w-full border border-gray-300 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all min-h-[120px]"
                            placeholder="כתוב את הודעתך כאן..."
                            value={newMsgContent}
                            onChange={e => setNewMsgContent(e.target.value)}
                        />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                      <button 
                        onClick={() => setShowNewMsgDialog(false)} 
                        className="px-6 py-2.5 rounded-xl hover:bg-gray-100 text-gray-700 font-medium transition-colors"
                        disabled={sending}
                      >
                        ביטול
                      </button>
                      <button 
                        onClick={handleSendBroadcast} 
                        className="bg-blue-600 text-white px-8 py-2.5 rounded-xl hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 font-medium transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        disabled={sending}
                      >
                        {sending ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                <span>שולח...</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">send</span>
                                <span>שלח הודעה</span>
                            </>
                        )}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  )
}
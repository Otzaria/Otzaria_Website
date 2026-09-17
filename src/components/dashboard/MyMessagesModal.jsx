'use client'

import { useState } from 'react'
import { formatDateShortMonthWithYearAndTime } from '@/lib/formatDate'

/**
 * MyMessagesModal - מודל "ההודעות שלי" בדשבורד: רשימת הודעות המשתמש עם ההיסטוריה
 * (שרשור תגובות) ואפשרות להשיב על הודעה.
 *
 * מנהל באופן עצמאי רק את הסטייט הפרטי לו (הודעה שנמצאת כרגע במצב מענה, תוכן
 * התגובה הנכתבת, ומצב שליחת התגובה) - כך שבכל פתיחה מחדש טופס המענה מתחיל
 * נקי, בדיוק כמו בהתנהגות המקורית. סימון הודעות כ"נקראו" (markMessagesAsRead)
 * וטעינת רשימת ההודעות (myMessages) עצמם נשארים באחריות ההורה, מכיוון שהם
 * קשורים גם לתג "הודעות שלא נקראו" המוצג על הכפתור שפותח את המודל, מחוץ למודל
 * עצמו.
 *
 * @param {Array} messages - רשימת ההודעות של המשתמש (myMessages בהורה)
 * @param {(message: object) => boolean} isReadByUser - האם הודעה מסוימת נקראה ע"י המשתמש הנוכחי (משותף עם חישוב תג ההודעות שלא נקראו בהורה)
 * @param {string} [currentUserId] - מזהה המשתמש המחובר, לזיהוי תגובות שהוא עצמו כתב
 * @param {() => void} onClose - נקרא כדי לסגור את המודל
 * @param {() => void} onMessagesChanged - נקרא לאחר שליחת תגובה בהצלחה, כדי שההורה ירענן את רשימת ההודעות
 * @param {(title: string, message: string) => void} showAlert - הצגת הודעת מערכת (מ-DialogContext)
 */
export default function MyMessagesModal({ messages, isReadByUser, currentUserId, onClose, onMessagesChanged, showAlert }) {
  const [replyingToMessageId, setReplyingToMessageId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const getReplySenderDisplayName = (reply) => {
    const replySenderId = reply?.sender
    if (currentUserId && replySenderId && String(currentUserId) === String(replySenderId)) {
      return 'אתה'
    }
    if (reply?.senderRole === 'admin') {
      return reply?.senderName || 'מנהל'
    }
    return reply?.senderName || 'משתמש'
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
        onMessagesChanged()
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
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
            onClick={onClose}
            className="p-2 hover:bg-surface-variant rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-2xl block text-on-surface">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-6xl text-on-surface/30 mb-4">
                inbox
              </span>
              <p className="text-on-surface/60">אין הודעות עדיין</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(message => {
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
                          {formatDateShortMonthWithYearAndTime(message.createdAt)}
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
  )
}

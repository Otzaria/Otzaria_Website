'use client'

import { useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'

/**
 * MessageUploaderDialog - חלון שליחת הודעה למשתמש שהעלה ספר/עמוד
 * (מדף ניהול ההעלאות).
 *
 * עצמאית: מחזיקה את שדות הטופס (נושא/תוכן) ואת מצב השליחה, ומבצעת בעצמה
 * את שרשרת הקריאות ל-API (איתור המשתמש לפי אימייל ואז שליחת ההודעה).
 * ההורה אחראי להרכיב את הקומפוננטה רק כאשר recipient קיים, ולפרק אותה
 * כדי לאפס את הטופס בפתיחה הבאה - בדיוק כמו ההתנהגות המקורית.
 *
 * Props:
 * - recipient: { email, name } - נמען ההודעה
 * - initialSubject: נושא ברירת המחדל של ההודעה
 * - onClose(): סגירת הדיאלוג
 */
export default function MessageUploaderDialog({ recipient, initialSubject, onClose }) {
  const { showAlert } = useDialog()
  const [messageSubject, setMessageSubject] = useState(initialSubject || '')
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  const handleSendMessageSubmit = async () => {
    if (!messageSubject.trim() || !messageText.trim()) {
      showAlert('שגיאה', 'נא למלא את כל השדות')
      return
    }

    try {
      setSendingMessage(true)

      // מציאת המשתמש לפי אימייל
      const usersResponse = await fetch('/api/admin/users')
      const usersData = await usersResponse.json()

      if (!usersData.success) {
        showAlert('שגיאה', 'שגיאה בטעינת רשימת המשתמשים')
        return
      }

      const user = usersData.users.find(u => u.email === recipient.email)
      if (!user) {
        showAlert('שגיאה', 'לא נמצא משתמש עם כתובת אימייל זו')
        return
      }

      const response = await fetch('/api/messages/send-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: user._id,
          subject: messageSubject,
          message: messageText,
          sendToAll: false
        })
      })

      const result = await response.json()
      if (result.success) {
        showAlert('הצלחה', 'ההודעה נשלחה בהצלחה')
        onClose()
      } else {
        showAlert('שגיאה', result.error || 'שגיאה בשליחת הודעה')
      }
    } catch (error) {
      showAlert('שגיאה', 'שגיאה בשליחת הודעה')
    } finally {
      setSendingMessage(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-200 flex-shrink-0 bg-white rounded-t-2xl">
          <h3 className="text-2xl font-bold text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-primary">send</span>
            שלח הודעה למשתמש
          </h3>
          <p className="text-sm text-neutral-600 mt-2">
            נמען: <span className="font-medium">{recipient.name}</span> ({recipient.email})
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">נושא</label>
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
            <label className="block text-sm font-bold text-on-surface mb-2">תוכן ההודעה</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="כתוב את ההודעה שלך כאן..."
              className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm min-h-[150px] resize-none"
              disabled={sendingMessage}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-neutral-200 bg-neutral-50 rounded-b-2xl flex-shrink-0">
          <button
            onClick={handleSendMessageSubmit}
            disabled={sendingMessage}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-all shadow-md font-bold disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5"
          >
            {sendingMessage ? (
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
            onClick={onClose}
            disabled={sendingMessage}
            className="px-6 py-3 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useDialog } from '@/components/providers/DialogContext'

/**
 * BookSubscribersModal - חלון רשימת הרשומים להתראות על ספרים חדשים
 * (מדף ניהול הספרים).
 *
 * עצמאית לחלוטין: טוענת את רשימת המנויים בעצמה בכל פתיחה, ומנהלת את
 * מחיקת המנוי מול ה-API. ההורה צריך רק להעביר isOpen/onClose.
 *
 * Props: isOpen (boolean), onClose()
 */
export default function BookSubscribersModal({ isOpen, onClose }) {
  const { showAlert, showConfirm } = useDialog()
  const [subscribersList, setSubscribersList] = useState([])
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const loadSubscribers = async () => {
      setIsLoadingSubscribers(true)
      try {
        const response = await fetch('/api/admin/mailing-list')
        const data = await response.json()

        if (cancelled) return

        if (data.success && Array.isArray(data.subscribers)) {
          setSubscribersList(data.subscribers)
        } else {
          setSubscribersList([])
        }
      } catch (error) {
        if (!cancelled) {
          showAlert('שגיאה', 'שגיאה בטעינת הרשימה')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSubscribers(false)
        }
      }
    }

    loadSubscribers()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleDeleteSubscriber = (email) => {
    showConfirm('הסרת מנוי', 'האם אתה בטוח שברצונך להסיר מנוי זה מהרשימה?', async () => {
      try {
        const response = await fetch('/api/admin/mailing-list/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        })

        const result = await response.json()

        if (result.success) {
          setSubscribersList(prev => prev.filter(s => s.email !== email))
          showAlert('הצלחה', 'המנוי הוסר בהצלחה')
        } else {
          showAlert('שגיאה', result.error || 'שגיאה במחיקת המנוי')
        }
      } catch (error) {
        showAlert('שגיאה', 'שגיאה בתקשורת')
      }
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-aqua-50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-aqua-100 p-2 rounded-full text-aqua-700">
              <span className="material-symbols-outlined">group</span>
            </div>
            <div>
              <h3 className="font-bold text-lg text-neutral-800">רשומים להתראות</h3>
              <p className="text-xs text-aqua-700 font-medium">עדכונים על ספרים חדשים</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-4 bg-neutral-50 border-b flex justify-between items-center">
          <span className="text-neutral-600 text-sm">סך הכל רשומים:</span>
          <span className="bg-aqua-600 text-white px-3 py-1 rounded-full font-bold text-sm">
            {isLoadingSubscribers ? '...' : subscribersList.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoadingSubscribers ? (
            <div className="flex justify-center py-8 text-aqua-600">
              <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
            </div>
          ) : subscribersList.length === 0 ? (
            <div className="text-center py-8 text-neutral-400">
              <span className="material-symbols-outlined text-4xl mb-2 opacity-30">unsubscribe</span>
              <p>אין רשומים ברשימה זו עדיין.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {subscribersList.map((subscriber, index) => (
                <li key={subscriber.email} className="flex items-center justify-between gap-3 p-3 bg-white border border-neutral-100 rounded-lg hover:border-aqua-200 hover:shadow-sm transition-all group">
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <span className="text-neutral-400 text-xs w-6">{index + 1}.</span>
                    <span className="material-symbols-outlined text-neutral-400 text-sm">mail</span>
                    <span className="text-neutral-700 font-mono text-sm truncate select-all" title={subscriber.email}>{subscriber.email}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-neutral-600 text-sm truncate">{subscriber.name}</span>
                    <button
                      onClick={() => handleDeleteSubscriber(subscriber.email)}
                      className="text-neutral-300 hover:text-danger-500 hover:bg-danger-50 p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100"
                      title="מחק מנוי"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t bg-neutral-50 text-center">
          <button
            onClick={onClose}
            className="w-full py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-100 font-medium text-sm"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}

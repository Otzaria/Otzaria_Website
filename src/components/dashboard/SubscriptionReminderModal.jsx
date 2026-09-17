'use client'

import { useState } from 'react'

/**
 * SubscriptionReminderModal - תזכורת הרשמה להתראות על ספרים חדשים
 *
 * מנהל באופן עצמאי רק את הסטייט הפרטי לו (מצב "מבטל תזכורת"). לוגיקת
 * ההרשמה/ביטול-הרשמה (toggleSubscription) ומצב הטעינה שלה (loadingSub)
 * משותפים גם למודל ההתראות הנפרד בדשבורד, ולכן מגיעים כ-props מההורה
 * ולא מנוהלים כאן. ההורה אחראי רק להרכיב (mount) את הקומפוננטה כאשר יש
 * להציג אותה ולפרק אותה (unmount) כאשר יש לסגור אותה.
 *
 * @param {() => void} onClose - נקרא כדי לסגור את המודל (הן בהרשמה והן בביטול)
 * @param {() => Promise<void>} toggleSubscription - הרשמה/ביטול הרשמה להתראות (משותף עם מודל ההתראות)
 * @param {boolean} loadingSub - מצב טעינה של פעולת ה-toggleSubscription (משותף עם מודל ההתראות)
 */
export default function SubscriptionReminderModal({ onClose, toggleSubscription, loadingSub }) {
  const [dismissingReminder, setDismissingReminder] = useState(false)

  const handleDismissReminderServerSide = async () => {
    try {
      setDismissingReminder(true)
      await fetch('/api/user/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error dismissing reminder:', error)
    } finally {
      setDismissingReminder(false)
      onClose()
    }
  }

  const handleSubscribeNow = async () => {
    await toggleSubscription()
    onClose()
  }

  return (
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
              onClick={handleSubscribeNow}
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
  )
}

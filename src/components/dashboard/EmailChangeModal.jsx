'use client'

import { useState } from 'react'

/**
 * EmailChangeModal - מודל עדכון כתובת מייל בדשבורד המשתמש
 *
 * מנהל באופן עצמאי את הסטייט של הטופס (כתובת המייל החדשה, מצב טעינה).
 * ההורה אחראי רק להרכיב (mount) את הקומפוננטה כאשר יש להציג אותה ולפרק אותה
 * (unmount) כאשר יש לסגור אותה - כך שבכל פתיחה מחדש הטופס מתחיל נקי מכתובת
 * המייל הנוכחית, בדיוק כמו בהתנהגות המקורית.
 *
 * @param {() => void} onClose - נקרא כדי לסגור את המודל (ביטול, הצלחה, או השלמה ללא שינוי)
 * @param {string} currentEmail - כתובת המייל הנוכחית של המשתמש (ברירת המחדל בטופס)
 * @param {(title: string, message: string) => void} showAlert - הצגת הודעת מערכת (מ-DialogContext)
 * @param {(title: string, message: string, onConfirm: () => void) => void} showConfirm - הצגת דיאלוג אישור (מ-DialogContext)
 * @param {() => Promise<any>} updateSession - רענון סשן ה-next-auth לאחר עדכון מוצלח (update() מ-useSession)
 */
export default function EmailChangeModal({ onClose, currentEmail, showAlert, showConfirm, updateSession }) {
  const [newEmail, setNewEmail] = useState(currentEmail || '')
  const [updatingEmail, setUpdatingEmail] = useState(false)

  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      showAlert('שגיאה', 'נא להזין כתובת מייל תקינה')
      return
    }

    if (newEmail === currentEmail) {
      onClose()
      return
    }

    setUpdatingEmail(true)

    try {
      const res = await fetch('/api/auth/update-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail })
      })
      const data = await res.json()

      if (res.ok) {
        await updateSession()
        showAlert('הצלחה', 'כתובת המייל עודכנה בהצלחה!')
        onClose()
      } else {
        showAlert('שגיאה', data.error || 'שגיאה בעדכון המייל')
      }
    } catch (error) {
      showAlert('שגיאה', 'שגיאת תקשורת')
    } finally {
      setUpdatingEmail(false)
    }
  }

  const handleSubmitClick = () => {
    if (!newEmail || !newEmail.includes('@')) {
      showAlert('שגיאה', 'נא להזין כתובת מייל תקינה')
      return
    }
    if (newEmail === currentEmail) {
      onClose()
      return
    }
    showConfirm(
      'עדכון כתובת מייל',
      'שינוי כתובת המייל ידרוש ביצוע אימות מחדש לכתובת החדשה כדי להמשיך להשתמש בחשבון. האם אתה בטוח?',
      () => handleUpdateEmail()
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-surface-variant bg-white/50 rounded-t-2xl flex justify-between items-center">
          <h3 className="text-xl font-bold text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-primary">manage_accounts</span>
            עדכון כתובת מייל
          </h3>
          <button
            onClick={onClose}
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
                {currentEmail}
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
                onClick={onClose}
                disabled={updatingEmail}
                className="flex-1 px-4 py-2 border border-surface-variant text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
            >
                ביטול
            </button>
            <button
                onClick={handleSubmitClick}
                disabled={updatingEmail || !newEmail || newEmail === currentEmail}
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
  )
}

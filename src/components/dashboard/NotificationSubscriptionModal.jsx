'use client'

/**
 * NotificationSubscriptionModal - מודל הצגת סטטוס הרשמה להתראות על ספרים חדשים
 * ואפשרות להירשם/לבטל הרשמה.
 *
 * לוגיקת ההרשמה/ביטול-הרשמה (toggleSubscription), מצב ההרשמה הנוכחי
 * (isSubscribed) ומצב הטעינה שלה (loadingSub) משותפים גם ל-SubscriptionReminderModal
 * בדשבורד, ולכן מגיעים כ-props מההורה ולא מנוהלים כאן. ההורה אחראי גם על
 * טעינת הסטטוס העדכני (checkSubscriptionStatus) בעת פתיחת המודל.
 *
 * @param {() => void} onClose - נקרא כדי לסגור את המודל
 * @param {() => Promise<void>} toggleSubscription - הרשמה/ביטול הרשמה להתראות (משותף עם מודל התזכורת)
 * @param {boolean} isSubscribed - האם המשתמש רשום כרגע להתראות
 * @param {boolean} loadingSub - מצב טעינה של פעולת ה-toggleSubscription (משותף עם מודל התזכורת)
 */
export default function NotificationSubscriptionModal({ onClose, toggleSubscription, isSubscribed, loadingSub }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-surface-variant bg-white/50 rounded-t-2xl flex justify-between items-center">
          <h3 className="text-xl font-bold text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-primary">notifications_active</span>
            התראות על ספרים חדשים
          </h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-800">
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
  )
}

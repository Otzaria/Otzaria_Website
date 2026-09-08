'use client'

/**
 * NotifyVisibilityDialog - חלון אישור חשיפת ספר לציבור, עם אפשרות לשלוח
 * הודעת מייל למנויים (מדף ניהול הספרים).
 *
 * קומפוננטה "טיפשה" ללא סטייט פנימי - כל הלוגיקה (קריאת ה-API, ניהול
 * מצב טעינה) נשארת בהורה, כדי לא לשנות את התנהגות העדכון האופטימי/הטעינה.
 *
 * Props:
 * - book: הספר שיוצג בהודעה (bookToToggle), עם שדה name
 * - isUpdatingStatus: האם מתבצע כרגע עדכון סטטוס
 * - onConfirm(sendNotification): חשיפת הספר, עם/בלי שליחת מייל
 * - onClose(): סגירת הדיאלוג
 */
export default function NotifyVisibilityDialog({ book, isUpdatingStatus, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-neutral-50 flex justify-between items-center">
          <h3 className="font-bold text-lg text-neutral-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">campaign</span>
            חשיפת ספר לקהל
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-neutral-700 text-base">
            הספר <strong>"{book.name}"</strong> יהפוך כעת לגלוי לכל המשתמשים.
          </p>
          <p className="font-bold text-neutral-900 text-base">
            האם ברצונך לשלוח עדכון במייל למנויים על ספר זה?
          </p>

          <div className="flex flex-col gap-3 mt-6">
            <button
              onClick={() => onConfirm(true)}
              disabled={isUpdatingStatus}
              className="w-full bg-success-600 text-white py-3 rounded-xl hover:bg-success-700 flex items-center justify-center gap-2 font-bold shadow-md transition-all hover:scale-[1.02]"
            >
              {isUpdatingStatus ? 'מעדכן ושולח...' : (
                <>
                  <span className="material-symbols-outlined">send</span>
                  כן, חשוף ושלח מייל
                </>
              )}
            </button>

            <button
              onClick={() => onConfirm(false)}
              disabled={isUpdatingStatus}
              className="w-full bg-neutral-100 text-neutral-700 py-3 rounded-xl hover:bg-neutral-200 border border-neutral-300 font-medium transition-all"
            >
              לא, רק חשוף (ללא מייל)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

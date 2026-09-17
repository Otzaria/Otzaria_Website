/**
 * ReminderUserSelectionModal - חלון קופץ לבחירת נמענים מסוימים מתוך רשימת
 * המשתמשים שנמצאו לתזכורת (דף admin/reminders). חולץ מ-page.jsx ללא שינוי
 * בהתנהגות.
 *
 * Props:
 * - users: foundUsersDetails - רשימת המשתמשים שנמצאו (עם books אופציונלי לדיקטה)
 * - selected: recipients - רשימת האימיילים הנבחרים כרגע
 * - bookType: 'regular' | 'dicta' - קובע האם מוצגת רשימת הספרים לכל משתמש
 * - onToggle(email): הפעלה/כיבוי בחירת משתמש בודד
 * - onSelectAll(): בחירת כל המשתמשים שנמצאו
 * - onSelectNone(): ניקוי הבחירה
 * - onClose(): סגירת החלון (גם כפתור האישור סוגר, ללא שמירה נפרדת - הבחירה כבר משתקפת ב-selected)
 */
export default function ReminderUserSelectionModal({ users, selected, bookType, onToggle, onSelectAll, onSelectNone, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-neutral-50 rounded-t-2xl">
          <h3 className="font-bold text-lg text-neutral-800">בחירת נמענים</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <div className="flex justify-between mb-4 text-sm">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-info-600 hover:underline"
            >
              בחר הכל
            </button>
            <button
              type="button"
              onClick={onSelectNone}
              className="text-danger-600 hover:underline"
            >
              נקה הכל
            </button>
          </div>

          <div className="space-y-2">
            {users.map((user) => (
              <label
                key={user.email}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                    ${selected.includes(user.email) ? 'bg-info-50 border-info-200' : 'hover:bg-neutral-50 border-neutral-100'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(user.email)}
                  onChange={() => onToggle(user.email)}
                  className="w-5 h-5 rounded text-info-600 focus:ring-info-500 mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-bold text-neutral-800">{user.name}</div>
                  <div className="text-xs text-neutral-500">{user.email}</div>
                  {bookType === 'dicta' && user.books && user.books.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {user.books.map((book, idx) => (
                        <div key={idx} className="text-xs bg-feature-50 text-feature-700 px-2 py-1 rounded">
                          {book.title} ({book.daysSinceClaim} ימים)
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-neutral-50 rounded-b-2xl flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-info-700 transition-colors"
          >
            אישור ({selected.length})
          </button>
        </div>
      </div>
    </div>
  )
}

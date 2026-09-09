/**
 * EditDictaBookStatusModal - חלון קופץ לעריכת סטטוס ספר דיקטה
 * חולץ מ-AdminDictaBooksClient.jsx ללא שינוי בהתנהגות.
 *
 * Props:
 * - book: הספר הנערך (editingBook) - חובה שיהיה לא-null כשמרכיבים קומפוננטה זו
 * - status: ערך הסטטוס הנוכחי בטופס
 * - onStatusChange(value)
 * - onClose(): סגירת החלון ללא שמירה
 * - onSave(): שמירת הסטטוס
 */
export default function EditDictaBookStatusModal({ book, status, onStatusChange, onClose, onSave }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-neutral-50 flex justify-between items-center">
          <h3 className="font-bold text-lg text-neutral-800">עריכת סטטוס ספר</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">שם הספר</label>
            <div className="w-full p-3 bg-neutral-50 rounded-lg text-neutral-600 border border-neutral-200">
              {book.title}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">סטטוס</label>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg p-3 focus:ring-2 focus:ring-primary outline-none bg-white"
            >
              <option value="available">פנוי</option>
              <option value="in-progress">בעריכה</option>
              <option value="completed">הושלם</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button
              onClick={onClose}
              className="px-5 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg font-medium transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={onSave}
              className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium shadow-sm transition-colors"
            >
              שמור שינויים
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

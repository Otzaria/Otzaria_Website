/**
 * CreateDictaBookModal - חלון קופץ ליצירת ספר דיקטה חדש ידנית
 * חולץ מ-AdminDictaBooksClient.jsx ללא שינוי בהתנהגות. ההורה אחראי
 * לניהול ה-state של השדות (title/content) ולהחליט מתי להציג את החלון.
 *
 * Props:
 * - title, content: ערכי השדות הנוכחיים
 * - onTitleChange(value), onContentChange(value)
 * - onClose(): סגירת החלון ללא שמירה
 * - onCreate(): יצירת הספר
 */
export default function CreateDictaBookModal({ title, content, onTitleChange, onContentChange, onClose, onCreate }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-neutral-50 flex justify-between items-center">
          <h3 className="font-bold text-lg text-neutral-800">יצירת ספר חדש ידנית</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2 font-medium text-neutral-700">שם הספר</label>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                placeholder="הזן שם לספר"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 font-medium text-neutral-700">תוכן התחלתי (אופציונלי)</label>
              <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                className="w-full p-3 border border-neutral-300 rounded-lg h-48 focus:ring-2 focus:ring-primary outline-none"
                placeholder="הדבק כאן טקסט התחלתי..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button
              onClick={onClose}
              className="px-5 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg font-medium transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={onCreate}
              className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium shadow-sm transition-colors"
            >
              צור ספר
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

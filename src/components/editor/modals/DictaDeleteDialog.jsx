import { useEffect } from 'react'
import Loader from '@/components/ui/Loader'

// דיאלוג אישור למחיקת עותק עריכה של ספר דיקטה שהועלה.
export default function DictaDeleteDialog({ bookTitle, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 bg-scrim/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-error-container rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-error">delete_forever</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">מחיקת עותק עריכה</h2>
          <p className="text-on-surface/70 font-bold">{bookTitle}</p>
        </div>
        <div className="bg-error-container border-2 border-error-container rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-error mt-0.5">error</span>
            <div className="text-sm text-on-error-container">
              <p className="font-bold mb-2">אזהרה: פעולה בלתי הפיכה!</p>
              <ul className="space-y-1">
                <li>• עותק העריכה יימחק לצמיתות</li>
                <li>• כל העריכות שביצעת יאבדו</li>
                <li>• ההעלאות המקוריות יישארו ללא שינוי</li>
                <li>• לא ניתן לשחזר את העותק לאחר המחיקה</li>
              </ul>
              <p className="mt-3 font-bold">האם אתה בטוח שברצונך למחוק?</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-error text-on-error rounded-lg hover:bg-error/90 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader size="inline" decorative className="text-xl" />
                <span>מוחק...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">delete_forever</span>
                <span>כן, מחק את העותק</span>
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-3 border-2 border-surface-variant text-on-surface rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

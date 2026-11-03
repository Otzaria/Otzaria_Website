import { useEffect } from 'react'
import Loader from '@/components/ui/Loader'

// דיאלוג אישור לפעולה בלתי הפיכה על עותק עריכה (איפוס/מחיקה).
export default function EditCopyConfirmDialog({
  icon,
  heading,
  bookTitle,
  warnings,
  question,
  confirmLabel,
  loadingLabel,
  onConfirm,
  onCancel,
  loading,
}) {
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-copy-confirm-heading"
        className="glass-strong rounded-2xl p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-error-container rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-error">{icon}</span>
          </div>
          <h2 id="edit-copy-confirm-heading" className="text-2xl font-bold text-on-surface mb-2">{heading}</h2>
          <p className="text-on-surface/70 font-bold">{bookTitle}</p>
        </div>
        <div className="bg-error-container border-2 border-error-container rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-error mt-0.5">error</span>
            <div className="text-sm text-on-error-container">
              <p className="font-bold mb-2">אזהרה: פעולה בלתי הפיכה!</p>
              <ul className="space-y-1">
                {warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
              <p className="mt-3 font-bold">{question}</p>
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
                <span>{loadingLabel}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">{icon}</span>
                <span>{confirmLabel}</span>
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

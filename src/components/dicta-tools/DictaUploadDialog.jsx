'use client'

import { useEffect } from 'react'

export default function DictaUploadDialog({ bookTitle, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onConfirm, onCancel])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-green-600">upload_file</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">סיום עבודה על {bookTitle}</h2>
        </div>
        <div className="flex justify-center mb-6">
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 max-w-xs">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-600 text-lg flex-shrink-0">warning</span>
              <div className="text-xs text-amber-800">
                <p className="font-bold mb-1">תזכורת חשובה!</p>
                <p className="font-bold mb-1">לפני הסיום יש לבצע:</p>
                <ul className="space-y-0.5">
                  <li>✓ בדיקת איות</li>
                  <li>✓ בדיקת שגיאות בכותרות</li>
                  <li>✓ ניקוי טקסט</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <p className="text-on-surface/70 text-center mb-6">האם ברצונך להעלות את הטקסט שערכת למערכת?</p>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 mt-0.5">info</span>
            <div className="text-sm text-blue-800">
              <p className="font-bold mb-1">מה יקרה?</p>
              <ul className="space-y-1">
                <li>• הטקסט שערכת יועלה כקובץ חדש</li>
                <li>• הקובץ יסומן כ"דיקטה" ויישלח לאישור מנהל</li>
                <li>• הספר יסומן כהושלם</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button 
            onClick={onConfirm} 
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                <span>מעלה...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">upload</span>
                <span>כן, העלה את הטקסט</span>
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

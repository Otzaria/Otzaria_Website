'use client'

import { useEffect, useRef, useState } from 'react'

// מודל המציג את עמוד המקור המלא סביב שורת תמלול, עם הדגשת מיקום השורה.
// line: { id, box: {x,y,width,height}, imageWidth, imageHeight }
// ההדגשה מחושבת באחוזים מתוך מידות התמונה המקורית, כך שהיא נכונה בכל גודל תצוגה.
export default function OcrLineContextModal({ line, onClose }) {
  const [dims, setDims] = useState({ w: line?.imageWidth || 0, h: line?.imageHeight || 0 })
  const [loaded, setLoaded] = useState(false)
  const highlightRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // גלילה אוטומטית אל השורה המודגשת ברגע שהתמונה נטענה
  useEffect(() => {
    if (loaded && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
  }, [loaded])

  if (!line) return null
  const { box } = line
  const hasDims = dims.w > 0 && dims.h > 0

  const pct = hasDims
    ? {
        right: `${(1 - (box.x + box.width) / dims.w) * 100}%`,
        top: `${(box.y / dims.h) * 100}%`,
        width: `${(box.width / dims.w) * 100}%`,
        height: `${(box.height / dims.h) * 100}%`,
      }
    : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-neutral-200">
          <div className="font-bold text-neutral-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">pageview</span>
            העמוד המלא — השורה מודגשת
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:bg-neutral-100 p-1.5 rounded-lg transition-colors"
            title="סגור"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-auto flex-1 bg-neutral-100 p-3">
          <div className="relative inline-block w-full">
            <img
              src={`/api/ocr-lines/${line.id}/image?full=1`}
              alt="עמוד מלא"
              className="w-full h-auto rounded shadow"
              onLoad={(e) => {
                // אם מידות התמונה לא נשמרו במסד — נמדדות מהתמונה עצמה (מוגשת במקור, ללא שינוי גודל)
                if (!hasDims) {
                  setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })
                }
                setLoaded(true)
              }}
            />
            {loaded && pct && (
              <div
                ref={highlightRef}
                className="absolute border-2 border-danger-600 bg-danger-600/15 rounded-sm pointer-events-none"
                style={pct}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

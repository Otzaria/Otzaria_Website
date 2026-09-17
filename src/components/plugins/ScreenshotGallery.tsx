'use client'

import { useState, useCallback, useEffect } from 'react'

interface ScreenshotGalleryProps {
  screenshots: string[]
}

// גלריית צילומי מסך + lightbox עם ניווט מקלדת (Escape/חצים) — חולץ מדף
// פרטי התוסף. מחזיק את מצב ה-lightbox באופן עצמאי; לא מרנדר דבר כשאין
// צילומי מסך.
export default function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const screenshotCount = screenshots.length

  const handleLightboxKey = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return
    if (e.key === 'Escape') setLightboxIndex(null)
    if (e.key === 'ArrowRight') setLightboxIndex(cur => cur !== null && cur > 0 ? cur - 1 : screenshotCount - 1)
    if (e.key === 'ArrowLeft') setLightboxIndex(cur => cur !== null && cur < screenshotCount - 1 ? cur + 1 : 0)
  }, [lightboxIndex, screenshotCount])

  useEffect(() => {
    window.addEventListener('keydown', handleLightboxKey)
    return () => window.removeEventListener('keydown', handleLightboxKey)
  }, [handleLightboxKey])

  if (screenshotCount === 0) return null

  return (
    <>
      {/* Screenshots Gallery */}
      <div className="bg-white rounded-2xl border border-neutral-100 p-6 mt-6">
        <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">photo_library</span>
          <span>צילומי מסך</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {screenshots.map((src, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className="aspect-video rounded-xl overflow-hidden bg-surface hover:ring-2 hover:ring-primary/40 transition-all focus:outline-none focus:ring-2 focus:ring-primary/60"
            >
              <img
                src={src}
                alt={`צילום מסך ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={e => { e.stopPropagation(); setLightboxIndex(cur => cur !== null && cur > 0 ? cur - 1 : screenshots.length - 1) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="הקודם"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <img
            src={screenshots[lightboxIndex]}
            alt={`צילום מסך ${lightboxIndex + 1}`}
            className="max-h-[85vh] max-w-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={e => { e.stopPropagation(); setLightboxIndex(cur => cur !== null && cur < screenshots.length - 1 ? cur + 1 : 0) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="הבא"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="סגור"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightboxIndex + 1} / {screenshots.length}
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'

export default function ImagePreviewModal({ isOpen, onClose, imageSrc, altText }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef(null)

  // איפוס בעת פתיחה מחדש
  useEffect(() => {
    if (isOpen) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
      document.body.style.overflow = 'hidden' // מניעת גלילה של האתר ברקע
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen, imageSrc])

  // סגירה ב-ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!isOpen || !imageSrc) return null

  // טיפול בזום עם הגלגלת
  const handleWheel = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY * -0.002
    const newScale = Math.min(Math.max(0.5, scale + delta), 5) // הגבלה בין 0.5 ל-5
    setScale(newScale)
  }

  // התחלת גרירה
  const handleMouseDown = (e) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  // ביצוע גרירה
  const handleMouseMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  // סיום גרירה
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    // הרקע הכהה - Fixed כדי לכסות את ה-Viewport
    <div 
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose} // לחיצה בחוץ סוגרת
    >
      {/* כפתורי שליטה */}
      <div className="absolute top-4 right-4 z-[101] flex gap-2">
                <button 
          onClick={onClose}
          className="bg-white/10 hover:bg-red-500/80 text-white p-2 rounded-full transition-colors"
          title="סגור"
        >
                  <span className="material-symbols-outlined">close</span>
        </button>  
        <button 
          onClick={(e) => { e.stopPropagation(); setScale(1); setPosition({x:0, y:0}); }}
          className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
          title="אפס תצוגה"
        >
          <span className="material-symbols-outlined">restart_alt</span>
        </button>


      </div>

      {/* קונטיינר התמונה */}
      <div 
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
      >
        <img 
          src={imageSrc} 
          alt={altText || 'תצוגה מקדימה'}
          className="max-w-[90vw] max-h-[90vh] object-contain transition-transform duration-75 ease-linear select-none shadow-2xl"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in'
          }}
          onClick={(e) => e.stopPropagation()} // מניעת סגירה בלחיצה על התמונה עצמה
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          draggable={false}
        />
      </div>

      {/* הנחיה למשתמש */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 text-sm bg-black/40 px-4 py-1 rounded-full pointer-events-none">
        גלול לזום • גרור להזזה
      </div>
    </div>
  )
}
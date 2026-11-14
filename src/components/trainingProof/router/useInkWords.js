'use client'

import { useEffect, useState } from 'react'
import { splitByInk, toGray } from './splitInk'

// חלוקה למילים לפי הדיו — רק כשצריך (שורה מעורבת בלי מילים מהתחנה). התמונה מאותו
// מקור (נתיב ה-API של האתר), ולכן אפשר לקרוא את הפיקסלים מ-canvas.
// מחזיר את התיבות בפיקסלים של התמונה (= w/h של הפריט), או null עד שחושבו.
export function useInkWords(src, needed) {
  const [boxes, setBoxes] = useState(null)
  useEffect(() => {
    if (!needed || boxes) return undefined
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, w, h).data
        setBoxes(splitByInk(toGray(data, w, h), w, h))
      } catch {
        setBoxes([])
      }
    }
    img.onerror = () => !cancelled && setBoxes([])
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src, needed, boxes])
  return boxes
}

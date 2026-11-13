'use client'

import { useEffect, useState } from 'react'
import { openPdf } from './pdfSlice'

/**
 * קורא את קובץ ה-PDF שנבחר (בדפדפן) ומחזיר כמה עמודים יש בו — בשביל בחירת טווח ב"הוספת ספר".
 * file = null → { status: 'none' }. בזמן הקריאה → 'reading'; אחריה 'ready' (עם doc, pageCount, encrypted)
 * או 'failed' (pdf-lib לא הצליח לפרש — אפשר עדיין להעלות את הקובץ בשלמותו; השרת ממיר עם pdfjs).
 * תוצאה של קובץ קודם (שהוחלף באמצע הקריאה) לא דורסת את של הנוכחי.
 *
 * @param {File | null} file
 * @returns {{ status: 'none' | 'reading' | 'ready' | 'failed', doc?: import('pdf-lib').PDFDocument, pageCount?: number, encrypted?: boolean }}
 */
export default function usePdfPages(file) {
  const [result, setResult] = useState({ file: null, status: 'none' })

  useEffect(() => {
    if (!file) return undefined
    let alive = true
    openPdf(file).then(
      ({ doc, pageCount, encrypted }) => { if (alive) setResult({ file, status: pageCount > 0 ? 'ready' : 'failed', doc, pageCount, encrypted }) },
      () => { if (alive) setResult({ file, status: 'failed' }) }
    )
    return () => { alive = false }
  }, [file])

  if (!file) return { status: 'none' }
  if (result.file !== file) return { status: 'reading' }
  const { file: _ignored, ...rest } = result
  return rest
}

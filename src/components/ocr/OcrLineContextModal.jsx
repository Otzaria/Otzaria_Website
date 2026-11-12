'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Loader from '@/components/ui/Loader'
import Notice from '@/components/ui/Notice'
import { cx } from '@/components/ui/cx'
import { lineHighlightStyle } from './lineHighlight'

// חלון "העמוד המלא" סביב שורת תמלול, עם הדגשת מיקום השורה (במסך הניהול ובדף המתנדבים).
// line: { id, box: {x,y,width,height}, imageWidth, imageHeight, bookName?, pageNumber? }
// ההדגשה מחושבת באחוזים מתוך מידות התמונה המקורית (lineHighlight.js), כך שהיא נכונה בכל גודל תצוגה.
// החלון עצמו — ui/Dialog (Esc, לחיצה ברקע, פוקוס, גיליון תחתון בטלפון).
// עד שהתמונה נטענת — מקום שמור (ביחס-הגובה של העמוד כשהמידות ידועות) עם "טוען את העמוד…";
// אם נכשלה — הודעה ו"נסה שוב" (טוען מחדש את אותה כתובת).
export default function OcrLineContextModal({ line, onClose }) {
  const [dims, setDims] = useState({ w: line?.imageWidth || 0, h: line?.imageHeight || 0 })
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const highlightRef = useRef(null)

  // גלילה אוטומטית אל השורה המודגשת ברגע שהתמונה נטענה
  useEffect(() => {
    if (loaded && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
  }, [loaded])

  if (!line) return null
  const hasDims = dims.w > 0 && dims.h > 0
  const pct = lineHighlightStyle(line.box, dims.w, dims.h)
  const where = [line.bookName, line.pageNumber != null ? `עמוד ${line.pageNumber}` : ''].filter(Boolean).join(' · ')

  return (
    <Dialog
      title="העמוד המלא"
      subtitle={where ? `${where} · השורה מסומנת באדום` : 'השורה מסומנת באדום'}
      onClose={onClose}
      className="sm:max-h-[92dvh] sm:max-w-4xl"
    >
      {failed ? (
        <Notice
          tone="error"
          role="alert"
          title="לא הצלחנו לטעון את העמוד"
          action={
            <Button
              variant="outlined"
              size="sm"
              icon="refresh"
              onClick={() => {
                setFailed(false)
                setAttempt((n) => n + 1)
              }}
            >
              נסה שוב
            </Button>
          }
        >
          אולי החיבור איטי או שהקובץ לא זמין כרגע.
        </Notice>
      ) : (
        <div
          className={cx(
            'relative w-full overflow-hidden rounded-(--radius-control) bg-surface-container-low leading-none',
            !loaded && !hasDims && 'min-h-64'
          )}
          style={!loaded && hasDims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
        >
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader size="md" label="טוען את העמוד…" showLabel />
            </div>
          )}
          <img
            key={attempt}
            src={`/api/ocr-lines/${line.id}/image?full=1`}
            alt="עמוד מלא"
            className={cx('block h-auto w-full', !loaded && 'absolute inset-0 opacity-0')}
            draggable={false}
            onLoad={(e) => {
              // אם מידות התמונה לא נשמרו במסד — נמדדות מהתמונה עצמה (מוגשת במקור, ללא שינוי גודל)
              if (!hasDims) {
                setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })
              }
              setLoaded(true)
            }}
            onError={() => setFailed(true)}
          />
          {loaded && pct && (
            <div
              ref={highlightRef}
              aria-hidden="true"
              className="pointer-events-none absolute rounded-(--radius-xs) border-2 border-error bg-error/15"
              style={pct}
            />
          )}
        </div>
      )}
    </Dialog>
  )
}

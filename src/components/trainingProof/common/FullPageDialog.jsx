'use client'

import { useEffect, useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import { boxStyle } from './boxStyle'

// "הצג בעמוד המלא" (זיהוי טקסט ונתב הכתב, אצל המתנדב ובסקירת המנהל): תמונת העמוד, והשורה
// מסומנת בה במסגרת אדומה — כמו "העמוד המלא — השורה מודגשת" של פלמוני (OcrLineContextModal).
// ctx.bbox בפיקסלים של תמונת העמוד; הסימון באחוזים, ולכן נכון בכל גודל תצוגה. העמוד בכל רוחב
// החלון, ו"הגדל" מציג אותו בגודלו המקורי; בשני המצבים החלון נגלל אל השורה.
export default function FullPageDialog({ ctx, alias, page, onClose, title = 'השורה בעמוד המלא' }) {
  const markRef = useRef(null)
  const [size, setSize] = useState(null)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    if (size) markRef.current?.scrollIntoView?.({ block: 'center', inline: 'center' })
  }, [size, zoom])

  return (
    <Dialog
      title={title}
      subtitle={[alias, page != null ? `עמוד ${page}` : ''].filter(Boolean).join(' · ')}
      onClose={onClose}
      className="sm:max-h-[92dvh] sm:max-w-4xl"
      footer={
        <button type="button" className="text-label-md text-primary underline-offset-2 hover:underline" aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>
          {zoom ? 'התאם לרוחב החלון' : 'הגדל (הגודל המקורי)'}
        </button>
      }
    >
      <div className={zoom ? 'overflow-auto' : ''}>
        <div
          className={`relative overflow-hidden rounded border border-outline-variant bg-white leading-none ${zoom ? 'w-max' : 'w-full'}`}
          data-testid="tp-fullpage"
        >
          <img
            src={ctx.img}
            alt="העמוד המלא"
            className={`block h-auto ${zoom ? 'max-w-none' : 'w-full'}`}
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {size ? (
            <div
              ref={markRef}
              data-testid="tp-fullpage-mark"
              aria-hidden
              className="pointer-events-none absolute rounded-sm border-2 border-danger-600 bg-danger-600/15"
              style={boxStyle(ctx.bbox, size.w, size.h)}
            />
          ) : null}
        </div>
      </div>
    </Dialog>
  )
}

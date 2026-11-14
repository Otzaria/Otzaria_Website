'use client'

import { useEffect, useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import { boxStyle } from './fastLogic'

// העמוד המלא של הסריקה, גלול אל המקום (כמו OcrLineContextModal). box — שברים מהתמונה המלאה
// ({x,y,w,h} או [x,y,w,h]); בלי box — העמוד בלי סימון. ההורה מרנדר רק כשהחלון פתוח.
export default function FullPageModal({ src, box = null, onClose, title = 'העמוד המלא' }) {
  const [loaded, setLoaded] = useState(false)
  const markRef = useRef(null)
  const style = boxStyle(box)

  useEffect(() => {
    if (loaded && markRef.current?.scrollIntoView) markRef.current.scrollIntoView({ block: 'center', inline: 'center' })
  }, [loaded])

  return (
    <Dialog title={title} subtitle={style ? 'המקום מסומן במסגרת אדומה' : null} onClose={onClose} className="sm:max-w-5xl" bodyClassName="bg-neutral-100">
      <div className="relative mx-auto w-full">
        <img src={src} alt="הסריקה של העמוד כולו" className="block h-auto w-full rounded shadow" draggable={false} onLoad={() => setLoaded(true)} />
        {style && (
          <div
            ref={markRef}
            data-testid="full-page-mark"
            className="pointer-events-none absolute rounded-sm border-2 border-danger-600 bg-danger-600/10"
            style={style}
          />
        )}
      </div>
    </Dialog>
  )
}

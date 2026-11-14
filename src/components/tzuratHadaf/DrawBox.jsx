'use client'

import { useEffect, useRef, useState } from 'react'
import { clientToImage } from '@/lib/pageProof/scanGeometry'
import { fracBoxFromPoints } from './reportLogic'

// ציור מלבן אחד על תמונה (הסריקה או העמוד שלנו) — בדרך של ProofScan: אירועי pointer עם setPointerCapture, שכבת SVG
// בגודל התמונה (viewBox = W×H בפיקסלי התמונה), והמלבן נשמר כשברים {x,y,w,h} (reportLogic.fracBoxFromPoints).
// value / onChange(box|null). focus — [x,y,w,h] בשברים: גוללים אליו בטעינה (למשל השורה שנבחרה).

export default function DrawBox({ src, W, H, value = null, onChange, label, focus = null, disabled = false }) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !focus || !Array.isArray(focus)) return
    const t = setTimeout(() => {
      el.scrollTop = Math.max(0, focus[1] * el.scrollHeight - el.clientHeight / 2)
    }, 50)
    return () => clearTimeout(t)
  }, [focus, zoomed])

  const pt = (e) => clientToImage(e, svgRef.current?.getBoundingClientRect(), W, H)

  const down = (e) => {
    if (disabled || e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = pt(e)
    setDrag({ a: p, b: p })
  }
  const move = (e) => {
    if (!drag) return
    setDrag((d) => (d ? { ...d, b: pt(e) } : d))
  }
  const up = (e) => {
    if (!drag) return
    const box = fracBoxFromPoints(drag.a, pt(e), W, H)
    setDrag(null)
    if (box) onChange(box)
  }

  const shown = drag
    ? { x: Math.min(drag.a[0], drag.b[0]), y: Math.min(drag.a[1], drag.b[1]), w: Math.abs(drag.b[0] - drag.a[0]), h: Math.abs(drag.b[1] - drag.a[1]) }
    : value
      ? { x: value.x * W, y: value.y * H, w: value.w * W, h: value.h * H }
      : null

  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      <figcaption className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-on-surface/80">{label}</span>
        <span className="text-xs text-on-surface/50">גררו כדי לסמן מלבן</span>
        <button type="button" onClick={() => setZoomed((z) => !z)} className="ms-auto flex items-center gap-1 rounded px-1 text-xs text-primary hover:underline">
          <span aria-hidden="true" className="material-symbols-outlined text-sm">{zoomed ? 'zoom_out' : 'zoom_in'}</span>
          {zoomed ? 'הקטנה' : 'הגדלה'}
        </button>
        {value && !disabled && (
          <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 rounded px-1 text-xs text-danger-700 hover:underline">
            <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
            ניקוי הסימון
          </button>
        )}
      </figcaption>
      <div ref={wrapRef} dir="ltr" className="custom-scrollbar max-h-[50vh] overflow-auto rounded-lg border border-outline-variant bg-neutral-100">
        <div className="relative" style={{ width: zoomed ? '200%' : '100%' }}>
          <img src={src} alt={label} className="block h-auto w-full select-none" draggable={false} />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className={`absolute inset-0 h-full w-full touch-none ${disabled ? '' : 'cursor-crosshair'}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => setDrag(null)}
            role="img"
            aria-label={value ? `${label}: מסומן מלבן` : `${label}: אין סימון`}
            data-testid="draw-svg"
          >
            {shown && (
              <rect
                x={shown.x}
                y={shown.y}
                width={shown.w}
                height={shown.h}
                fill="rgba(220,38,38,0.12)"
                stroke="rgb(220,38,38)"
                strokeWidth={Math.max(2, W / 400)}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </div>
      </div>
    </figure>
  )
}

'use client'

import { useRef, useState, useCallback } from 'react'
import {
  imageCoordsFromClientPoint,
  dragBandEdge,
  moveBox,
  resizeBox,
  drawBox,
} from '@/lib/ocr/pageCanvasGeometry'

// קנבס עמוד לתיוג מבנה: תמונת העמוד עם שכבות SVG אינטראקטיביות —
// רצועות זרמים (גרירת גבולות אופקיים), תיבת כותרת (גרירה/שינוי גודל/ציור)
// וסמני-תצוגה. הקואורדינטות בכל השכבות הן במרחב התמונה המקורית
// (viewBox = מידות התמונה), כך שאין שום המרת-חיתוך בין לקוח לשרת.
//
// props:
//   imageUrl, imageWidth, imageHeight — התמונה המלאה כפי שהיא
//   clipHeight — גובה (px תמונה) להצגה חלקית מלמעלה (משימת כותרת)
//   bands / legendColors / onBandsChange — רצועות זרמים {y0,y1,book_stream} (0..1)
//   headerBox / onHeaderBoxChange / headerDrawable — תיבת כותרת {x,y,width,height}
//   markers — [{box, color, label}] תיבות תצוגה בלבד (למשל מספר-עמוד)

export const STREAM_COLORS = [
  '#2563eb', '#d97706', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f',
]

export function streamColor(bookStream) {
  if (bookStream === null || bookStream === undefined) return '#6b7280'
  return STREAM_COLORS[bookStream % STREAM_COLORS.length]
}

export default function PageCanvas({
  imageUrl,
  imageWidth: W,
  imageHeight: H,
  clipHeight = null,
  bands = null,
  onBandsChange = null,
  headerBox = undefined, // undefined = אין שכבת כותרת; null = יש שכבה בלי תיבה
  onHeaderBoxChange = null,
  headerDrawable = false,
  markers = [],
}) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const [, forceRender] = useState(0)

  const viewH = clipHeight ? Math.min(H, clipHeight) : H

  // המרת אירוע עכבר/מגע לקואורדינטות התמונה
  const toImageCoords = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect()
    return imageCoordsFromClientPoint(e, rect, W, viewH)
  }, [W, viewH])

  const startDrag = (e, drag) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { ...drag, start: toImageCoords(e) }
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const p = toImageCoords(e)

    if (d.type === 'band-edge' && bands && onBandsChange) {
      onBandsChange(dragBandEdge(bands, d.index, d.edge, p.y, H))
    } else if (d.type === 'box-move' && onHeaderBoxChange) {
      onHeaderBoxChange(moveBox(d.box, p.x - d.start.x, p.y - d.start.y, W, H))
    } else if (d.type === 'box-resize' && onHeaderBoxChange) {
      onHeaderBoxChange(resizeBox(d.box, p.x - d.start.x, p.y - d.start.y, W, H))
    } else if (d.type === 'box-draw' && onHeaderBoxChange) {
      // קטימה לגבולות התמונה — המצביע יכול לחרוג מהן תוך גרירה (pointer capture)
      onHeaderBoxChange(drawBox(d.start, p, W, H))
    }
    forceRender((n) => n + 1)
  }

  const endDrag = () => {
    dragRef.current = null
  }

  // עובי קווים/ידיות פרופורציונלי לתמונה, כדי שייראה אחיד בכל הגדלה
  const lw = Math.max(2, Math.round(W / 400))
  const handle = lw * 4

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${viewH}`}
      className="w-full h-auto select-none touch-none bg-white rounded-lg border border-neutral-200"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerDown={
        headerDrawable && headerBox === null && onHeaderBoxChange
          ? (e) => startDrag(e, { type: 'box-draw' })
          : undefined
      }
      style={headerDrawable && headerBox === null ? { cursor: 'crosshair' } : undefined}
    >
      <image href={imageUrl} x="0" y="0" width={W} height={H} />

      {/* רצועות זרמים */}
      {bands?.map((b, i) => {
        const color = streamColor(b.book_stream)
        const y0 = b.y0 * H
        const y1 = b.y1 * H
        return (
          <g key={i}>
            <rect x="0" y={y0} width={W} height={y1 - y0} fill={color} fillOpacity="0.14" />
            <line x1="0" y1={y0} x2={W} y2={y0} stroke={color} strokeWidth={lw} />
            <line x1="0" y1={y1} x2={W} y2={y1} stroke={color} strokeWidth={lw} />
            {onBandsChange && (
              <>
                {/* אזורי אחיזה שקופים רחבים סביב הגבולות */}
                <rect
                  x="0" y={y0 - handle} width={W} height={handle * 2}
                  fill="transparent" style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => startDrag(e, { type: 'band-edge', index: i, edge: 'y0' })}
                />
                <rect
                  x="0" y={y1 - handle} width={W} height={handle * 2}
                  fill="transparent" style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => startDrag(e, { type: 'band-edge', index: i, edge: 'y1' })}
                />
              </>
            )}
            {/* מספר הרצועה בפינה הימנית — RTL */}
            <circle cx={W - handle * 3} cy={y0 + handle * 3} r={handle * 2.2} fill={color} />
            <text
              x={W - handle * 3} y={y0 + handle * 3}
              textAnchor="middle" dominantBaseline="central"
              fill="#fff" fontSize={handle * 2.4} fontWeight="bold"
            >
              {i + 1}
            </text>
          </g>
        )
      })}

      {/* תיבת כותרת */}
      {headerBox && (
        <g>
          <rect
            x={headerBox.x} y={headerBox.y} width={headerBox.width} height={headerBox.height}
            fill="#f59e0b" fillOpacity="0.18" stroke="#d97706" strokeWidth={lw}
            style={onHeaderBoxChange ? { cursor: 'move' } : undefined}
            onPointerDown={onHeaderBoxChange ? (e) => startDrag(e, { type: 'box-move', box: { ...headerBox } }) : undefined}
          />
          {onHeaderBoxChange && (
            <rect
              x={headerBox.x + headerBox.width - handle * 1.5}
              y={headerBox.y + headerBox.height - handle * 1.5}
              width={handle * 3} height={handle * 3}
              fill="#d97706" style={{ cursor: 'nwse-resize' }}
              onPointerDown={(e) => startDrag(e, { type: 'box-resize', box: { ...headerBox } })}
            />
          )}
        </g>
      )}

      {/* סמני תצוגה בלבד */}
      {markers.map((m, i) =>
        m?.box ? (
          <rect
            key={`m${i}`}
            x={m.box.x} y={m.box.y} width={m.box.width} height={m.box.height}
            fill="none" stroke={m.color || '#dc2626'} strokeWidth={lw} strokeDasharray={`${lw * 2} ${lw * 2}`}
          />
        ) : null
      )}
    </svg>
  )
}

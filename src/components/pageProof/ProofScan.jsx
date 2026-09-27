'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { streamInfo } from '@/lib/pageProof/vocab'
import { hitLine, hitFrame, linesInRect, normRect } from '@/lib/pageProof/view'

// הסריקה + שכבות: תיבות-השורות בצבעי-הזרמים, מסגרות, קישורים. ה-SVG
// במרחב הפיקסלים של תמונת-העמוד (viewBox = doc.size), כך שכל הקואורדינטות
// של החוזה מצוירות כמו-שהן, והזום הוא רק רוחב ה-SVG.
//
// מצבים (mode): select — לחיצה בוחרת שורה, גרירה בוחרת כמה; frame — גרירה
// על אזור ריק מציירת מסגרת, גרירת מסגרת מזיזה, פינה משנה גודל; bbox — ידיות
// לתיבת השורה הנבחרת; add — ציור תיבה לשורה חדשה; split — לחיצה על שורה
// מפצלת אותה בנקודה; link — לחיצה על שתי שורות יוצרת קישור.

const MIN_DRAG = 6

const CORNERS = ['nw', 'ne', 'sw', 'se']

function resizeBox(b, corner, [dx, dy]) {
  let [x0, y0, x1, y1] = b
  if (corner.includes('w')) x0 += dx
  if (corner.includes('e')) x1 += dx
  if (corner.includes('n')) y0 += dy
  if (corner.includes('s')) y1 += dy
  return normRect([x0, y0], [x1, y1])
}

const moveBox = (b, [dx, dy]) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy].map(Math.round)

const clampBox = (b, W, H) => {
  const w = b[2] - b[0]
  const h = b[3] - b[1]
  const x0 = Math.max(0, Math.min(W - w, b[0]))
  const y0 = Math.max(0, Math.min(H - h, b[1]))
  return [x0, y0, x0 + w, y0 + h].map(Math.round)
}

const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]

export default function ProofScan({
  view,
  imageUrl,
  zoom,
  mode,
  sel,
  straddling,
  linkFrom,
  focusId,
  readOnly,
  onSelectLines,
  onSelectFrame,
  onDrawRect,
  onFrameChange,
  onBboxChange,
  onSplit,
  onLinkPick,
}) {
  const [W, H] = view.size
  const svgRef = useRef(null)
  const boxRef = useRef(null)
  const drag = useRef(null)
  const [temp, setTemp] = useState(null) // {kind:'rect'|'frame'|'bbox', box, fid?, id?}
  const [imgFailed, setImgFailed] = useState(false)

  const selected = new Set(sel.ids)
  const lineW = Math.max(2, W / 700)
  const fontSize = Math.max(14, W / 90)

  // מיקום בתמונה מאירוע-עכבר
  const toPt = useCallback((e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return [Math.round(p.x), Math.round(p.y)]
  }, [])

  // גלילה לשורה שנבחרה בטקסט
  useEffect(() => {
    if (focusId == null || !boxRef.current) return
    const l = view.lines.find((x) => x.id === focusId)
    if (!l?.bbox) return
    const el = boxRef.current
    const [cx, cy] = center(l.bbox)
    const top = cy * zoom - el.clientHeight / 2
    const left = cx * zoom - el.clientWidth / 2
    el.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: 'smooth' })
    // רק כשהמיקוד משתנה — לא בכל שינוי בשורות
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    const p = toPt(e)
    const handle = e.target.dataset?.handle
    const hFid = e.target.dataset?.fid
    e.currentTarget.setPointerCapture(e.pointerId)

    if (mode === 'frame' && !readOnly) {
      if (handle && hFid) {
        const f = view.frames.find((x) => x.fid === hFid)
        drag.current = { kind: 'frame-resize', fid: hFid, corner: handle, start: p, orig: f.bbox }
        return
      }
      const f = hitFrame(view.frames, p)
      if (f) {
        onSelectFrame(f.fid)
        drag.current = { kind: 'frame-move', fid: f.fid, start: p, orig: f.bbox }
        return
      }
      drag.current = { kind: 'draw', start: p }
      return
    }
    if (mode === 'bbox' && !readOnly && handle && e.target.dataset?.line) {
      const id = Number(e.target.dataset.line)
      const l = view.lines.find((x) => x.id === id)
      drag.current = { kind: 'bbox', id, corner: handle, start: p, orig: l.bbox }
      return
    }
    if (mode === 'add' && !readOnly) {
      drag.current = { kind: 'draw', start: p }
      return
    }
    drag.current = { kind: 'band', start: p, additive: e.shiftKey || e.ctrlKey || e.metaKey }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const p = toPt(e)
    const delta = [p[0] - d.start[0], p[1] - d.start[1]]
    if (d.kind === 'draw' || d.kind === 'band') {
      if (Math.abs(delta[0]) + Math.abs(delta[1]) < MIN_DRAG) return
      setTemp({ kind: d.kind === 'band' ? 'band' : 'rect', box: normRect(d.start, p) })
    } else if (d.kind === 'frame-move') {
      setTemp({ kind: 'frame', fid: d.fid, box: clampBox(moveBox(d.orig, delta), W, H) })
    } else if (d.kind === 'frame-resize') {
      setTemp({ kind: 'frame', fid: d.fid, box: resizeBox(d.orig, d.corner, delta) })
    } else if (d.kind === 'bbox') {
      setTemp({ kind: 'bbox', id: d.id, box: resizeBox(d.orig, d.corner, delta) })
    }
  }

  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    const t = temp
    setTemp(null)
    if (!d) return
    const p = toPt(e)
    const moved = Math.abs(p[0] - d.start[0]) + Math.abs(p[1] - d.start[1]) >= MIN_DRAG
    const valid = (b) => b && b[2] - b[0] >= MIN_DRAG && b[3] - b[1] >= MIN_DRAG

    if (d.kind === 'draw') {
      if (moved && t && valid(t.box)) onDrawRect(clampToImage(t.box, W, H))
      return
    }
    if (d.kind === 'frame-move' || d.kind === 'frame-resize') {
      if (moved && t && valid(t.box)) onFrameChange(d.fid, clampToImage(t.box, W, H))
      return
    }
    if (d.kind === 'bbox') {
      if (moved && t && valid(t.box)) onBboxChange(d.id, clampToImage(t.box, W, H))
      return
    }
    // band / לחיצה
    if (moved && t) {
      onSelectLines(linesInRect(view.lines, t.box), d.additive)
      return
    }
    const hit = hitLine(view.lines, p)
    if (mode === 'split' && hit && !readOnly) {
      onSplit(hit.id, p[0])
      return
    }
    if (mode === 'link' && hit && !readOnly) {
      onLinkPick(hit.id)
      return
    }
    if (mode === 'frame') return
    onSelectLines(hit ? [hit.id] : [], d.additive)
  }

  const frameBox = (f) => (temp?.kind === 'frame' && temp.fid === f.fid ? temp.box : f.bbox)
  const lineBox = (l) => (temp?.kind === 'bbox' && temp.id === l.id ? temp.box : l.bbox)
  const byId = new Map(view.lines.map((l) => [l.id, l]))
  const handleSize = Math.max(10, W / 120)

  return (
    <div ref={boxRef} className="relative h-full overflow-auto bg-surface-variant/40 rounded-lg" dir="ltr">
      {imgFailed && (
        <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded bg-danger-100 px-3 py-1 text-sm text-danger-700" dir="rtl">
          תמונת-העמוד לא נטענה
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W * zoom}
        height={H * zoom}
        className={`block select-none ${mode === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <image href={imageUrl} x="0" y="0" width={W} height={H} onError={() => setImgFailed(true)} />

        {view.lines.map((l) => {
          const b = lineBox(l)
          if (!b) return null
          const s = streamInfo(view, l.stream)
          const isSel = selected.has(l.id)
          const removed = l.status === 'removed'
          const straddle = straddling.has(l.id)
          const stroke = removed ? '#9ca3af' : straddle ? '#dc2626' : s.color
          return (
            <rect
              key={l.id}
              x={b[0]}
              y={b[1]}
              width={b[2] - b[0]}
              height={b[3] - b[1]}
              fill={isSel ? s.color : 'transparent'}
              fillOpacity={isSel ? 0.22 : 0}
              stroke={stroke}
              strokeOpacity={removed ? 0.6 : 0.9}
              strokeWidth={isSel ? lineW * 2 : lineW}
              strokeDasharray={removed || straddle || l._new ? `${lineW * 4} ${lineW * 3}` : undefined}
              pointerEvents="none"
            />
          )
        })}

        {(view.links || [])
          .filter((k) => k.to_page === view.page && byId.has(k.from_line) && byId.has(k.to_line))
          .map((k) => {
            const a = center(byId.get(k.from_line).bbox)
            const b = center(byId.get(k.to_line).bbox)
            const color = k.suspect ? '#dc2626' : k.src === 'human' ? '#059669' : '#7c3aed'
            return (
              <line
                key={`${k.from_line}-${k.to_line}`}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke={color}
                strokeWidth={lineW * 1.5}
                strokeDasharray={k.src === 'human' ? undefined : `${lineW * 5} ${lineW * 3}`}
                opacity={0.8}
                pointerEvents="none"
              />
            )
          })}

        {(view.frames || []).map((f) => {
          const b = frameBox(f)
          const s = streamInfo(view, f.stream)
          const isSel = sel.fid === f.fid
          return (
            <g key={f.fid}>
              <rect
                x={b[0]}
                y={b[1]}
                width={b[2] - b[0]}
                height={b[3] - b[1]}
                fill={s.color}
                fillOpacity={isSel ? 0.1 : 0.04}
                stroke={s.color}
                strokeWidth={lineW * (isSel ? 3 : 2)}
                strokeDasharray={f.kind ? `${lineW * 2} ${lineW * 2}` : undefined}
                pointerEvents="none"
              />
              <text x={b[2] - 4} y={b[1] - 6} textAnchor="end" fontSize={fontSize} fill={s.color} fontWeight="bold" pointerEvents="none">
                {`${s.he}${s.heading ? ' (כותרת)' : ''}${f.seq ? ` · ${f.seq}` : ''}${f.kind ? ' · אובייקט' : ''}`}
              </text>
              {mode === 'frame' && isSel && !readOnly &&
                CORNERS.map((c) => (
                  <rect
                    key={c}
                    data-handle={c}
                    data-fid={f.fid}
                    x={(c.includes('w') ? b[0] : b[2]) - handleSize / 2}
                    y={(c.includes('n') ? b[1] : b[3]) - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#fff"
                    stroke={s.color}
                    strokeWidth={lineW}
                    className="cursor-nwse-resize"
                  />
                ))}
            </g>
          )
        })}

        {mode === 'bbox' && !readOnly && sel.ids.length === 1 && (() => {
          const l = byId.get(sel.ids[0])
          if (!l?.bbox || l._new) return null
          const b = lineBox(l)
          return CORNERS.map((c) => (
            <rect
              key={c}
              data-handle={c}
              data-line={l.id}
              x={(c.includes('w') ? b[0] : b[2]) - handleSize / 2}
              y={(c.includes('n') ? b[1] : b[3]) - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="#fff"
              stroke="#111"
              strokeWidth={lineW}
              className="cursor-nwse-resize"
            />
          ))
        })()}

        {linkFrom != null && byId.get(linkFrom)?.bbox && (() => {
          const b = byId.get(linkFrom).bbox
          return (
            <rect x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} fill="#059669" fillOpacity={0.25} stroke="#059669" strokeWidth={lineW * 2} pointerEvents="none" />
          )
        })()}

        {temp && (temp.kind === 'rect' || temp.kind === 'band') && (
          <rect
            x={temp.box[0]}
            y={temp.box[1]}
            width={temp.box[2] - temp.box[0]}
            height={temp.box[3] - temp.box[1]}
            fill={temp.kind === 'band' ? '#2563eb' : '#f59e0b'}
            fillOpacity={0.12}
            stroke={temp.kind === 'band' ? '#2563eb' : '#d97706'}
            strokeWidth={lineW * 1.5}
            strokeDasharray={`${lineW * 4} ${lineW * 3}`}
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  )
}

function clampToImage(b, W, H) {
  return [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(W, b[2]), Math.min(H, b[3])].map(Math.round)
}

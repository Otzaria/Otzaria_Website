'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { centerFraction, clampPaneZoom, lineBoxes, paneZoomStep, scrollForFraction } from './paneGeometry'

// "מבט כללי": הסריקה של וילנא והעמוד שלנו זה לצד זה, עם זום משותף (+/−/התאמה, Ctrl+גלגלת) וגלילה מסונכרנת
// במרחב השברים. ריחוף על תיבת שורה באחד הלוחות מסמן את אותה שורה בשניהם (תיבות שקופות מעל התמונות, מהמודל:
// lines[].scan / lines[].ours). הלוחות ב-dir="ltr" — כדי שהגלילה האופקית תהיה אחידה בכל הדפדפנים.

const SIDES = [
  { side: 'scan', label: 'הסריקה (דפוס וילנא)' },
  { side: 'ours', label: 'העמוד שלנו' },
]
const LOCK_MS = 120

function Pane({ side, label, src, boxes, zoom, hovered, onHover, paneRef, onScroll, showLines }) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      <figcaption className="text-sm font-bold text-on-surface/80">{label}</figcaption>
      <div
        ref={paneRef}
        dir="ltr"
        onScroll={onScroll}
        className="custom-scrollbar relative h-[70vh] overflow-auto rounded-lg border border-outline-variant bg-neutral-100"
        data-testid={`pane-${side}`}
        tabIndex={0}
        aria-label={label}
      >
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          <img src={src} alt={label} className="block h-auto w-full select-none" draggable={false} />
          {showLines &&
            boxes.map((b) => (
              <div
                key={b.key}
                title={b.label}
                data-line={b.key}
                onMouseEnter={() => onHover(b.key)}
                onMouseLeave={() => onHover(null)}
                className={`absolute rounded-sm transition-colors ${hovered === b.key ? 'bg-warning-300/35 ring-2 ring-warning-500' : 'hover:ring-1 hover:ring-info-400'}`}
                style={b.style}
              />
            ))}
        </div>
      </div>
    </figure>
  )
}

export default function SyncedPanes({ scanSrc, oursSrc, model, showLines = true }) {
  const [zoom, setZoom] = useState(1)
  const [hovered, setHovered] = useState(null)
  const scanRef = useRef(null)
  const oursRef = useRef(null)
  const locks = useRef({ scan: 0, ours: 0 })
  const keepCenter = useRef(null)
  const boxes = { scan: lineBoxes(model, 'scan'), ours: lineBoxes(model, 'ours') }
  const paneEl = useCallback((side) => (side === 'scan' ? scanRef.current : oursRef.current), [])

  const sync = useCallback(
    (from) => {
      const now = Date.now()
      if (now < locks.current[from]) return
      const to = from === 'scan' ? 'ours' : 'scan'
      const a = paneEl(from)
      const b = paneEl(to)
      if (!a || !b) return
      locks.current[to] = now + LOCK_MS
      setScroll(b, scrollForFraction(centerFraction(a), b))
    },
    [paneEl]
  )

  // שינוי זום: שומרים את נקודת המרכז ומחזירים אליה אחרי הפריסה
  const changeZoom = useCallback((next) => {
    const el = scanRef.current
    if (el) keepCenter.current = centerFraction(el)
    setZoom((z) => clampPaneZoom(typeof next === 'function' ? next(z) : next))
  }, [])

  useLayoutEffect(() => {
    const f = keepCenter.current
    keepCenter.current = null
    if (!f) return
    for (const side of ['scan', 'ours']) {
      const el = paneEl(side)
      if (!el) continue
      locks.current[side] = Date.now() + LOCK_MS
      setScroll(el, scrollForFraction(f, el))
    }
  }, [zoom, paneEl])

  // Ctrl+גלגלת — מאזין native לא פסיבי (כדי לבטל את הזום של הדפדפן)
  useEffect(() => {
    const els = [scanRef.current, oursRef.current].filter(Boolean)
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      changeZoom((z) => paneZoomStep(z, e.deltaY < 0 ? 1 : -1))
    }
    for (const el of els) el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      for (const el of els) el.removeEventListener('wheel', onWheel)
    }
  }, [changeZoom])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="זום">
        <button type="button" onClick={() => changeZoom((z) => paneZoomStep(z, -1))} aria-label="הקטנה" className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined">zoom_out</span>
        </button>
        <span className="w-14 text-center text-sm tabular-nums text-on-surface/70" data-testid="zoom-value">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" onClick={() => changeZoom((z) => paneZoomStep(z, 1))} aria-label="הגדלה" className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined">zoom_in</span>
        </button>
        <button type="button" onClick={() => changeZoom(1)} className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm hover:bg-surface-variant">
          <span aria-hidden="true" className="material-symbols-outlined text-base">fullscreen</span>
          התאמה לרוחב
        </button>
        <span className="text-xs text-on-surface/50">Ctrl+גלגלת — זום · הגלילה בשני הלוחות יחד</span>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        {SIDES.map((s) => (
          <Pane
            key={s.side}
            side={s.side}
            label={s.label}
            src={s.side === 'scan' ? scanSrc : oursSrc}
            boxes={boxes[s.side]}
            zoom={zoom}
            hovered={hovered}
            onHover={setHovered}
            paneRef={s.side === 'scan' ? scanRef : oursRef}
            onScroll={() => sync(s.side)}
            showLines={showLines}
          />
        ))}
      </div>
    </div>
  )
}

// גלילת לוח למקום (scrollTo כשיש — בסביבת בדיקות אין)
function setScroll(el, pos) {
  if (typeof el.scrollTo === 'function') el.scrollTo(pos)
  else {
    el.scrollLeft = pos.left
    el.scrollTop = pos.top
  }
}

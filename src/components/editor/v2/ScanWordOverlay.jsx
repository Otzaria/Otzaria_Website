'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { hitTestScan, lineGapPad } from '@/lib/editor/caretTrack'
import { REDUCED_MOTION_QUERY, prefersReducedMotion } from '@/lib/reducedMotion'

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => prefersReducedMotion())
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(REDUCED_MOTION_QUERY)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/**
 * נקודת מסך → קואורדינטות המקור (ה-viewBox), לפי המלבן של השכבה.
 * @param {SVGSVGElement} svg
 * @returns {{ x: number, y: number }|null}
 */
export function clientToSource(svg, clientX, clientY, W, H) {
  const r = svg?.getBoundingClientRect?.()
  if (!r || !(r.width > 0) || !(r.height > 0)) return null
  return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H }
}

// מלבן עם גאומטריה גם כמאפייני CSS (x/y/width/height), כדי שמעבר CSS יחליק את התזוזה
function geo(b, motion) {
  const g = { x: b[0], y: b[1], width: Math.max(0, b[2] - b[0]), height: Math.max(0, b[3] - b[1]) }
  return { attrs: g, style: motion ? { ...g, transition: 'x .15s ease-out, y .15s ease-out, width .15s ease-out, height .15s ease-out' } : null }
}

/**
 * עוצמות הסימון. מילה: מלבן מעוגל אחד שעוטף אותה בריווח נוח (לא צמוד לאותיות) — מילוי ענבר
 * ברור בפנים (multiply — האותיות השחורות נשארות חדות) וקו רציף דק סביבו בגוון עמוק יותר מאותה
 * משפחה (גם הוא multiply, כך שהוא נבלע במילוי). הצבעים: --editor-scan-mark(-edge), editor-themes.css.
 * פס השורה: הכהיה חומה-חמה (--editor-scan-band, multiply) שנראית במבט חטוף גם על צילום אפור,
 * ושני קווים דקים בקצותיו (bandEdge) שמסמנים את גבולות השורה. האותיות בתוך הפס נשארות כהות
 * וקריאות (multiply לא מבהיר דבר), והמילה עצמה בולטת מעליו בענבר רווי ובמסגרת.
 * מיקום משוער — מילוי מעט חלש יותר (WORD_FRAME.estimatedFill). "חזק" (ברירת המחדל) / "רגיל" — עדין יותר.
 */
export const SCAN_HIGHLIGHT = {
  normal: { band: 0.2, bandEdge: 0.45, stroke: 1.25, strokeOpacity: 0.7, fill: 0.34 },
  strong: { band: 0.28, bandEdge: 0.6, stroke: 1.5, strokeOpacity: 0.85, fill: 0.52 }
}

const MARK = 'var(--editor-scan-mark, var(--color-glow))'
const MARK_EDGE = 'var(--editor-scan-mark-edge, var(--color-primary))'
const BAND = 'var(--editor-scan-band, var(--color-glow))'
const BAND_EDGE = 'var(--editor-scan-band-edge, var(--color-primary))'

/**
 * שני הקווים הדקים בקצות פס השורה (למעלה ולמטה), כמלבנים דקים — כך שמעבר CSS מחליק גם אותם.
 * מעט פנימה מהקצוות המעוגלים של הפס, כדי שלא יבלטו מעבר לפינות.
 * @param {number[]} band [x0, y0, x1, y1]
 * @param {number} t עובי הקו (ביחידות המקור)
 * @param {number} inset ריווח מהקצוות הצדדיים
 * @returns {number[][]} [עליון, תחתון]
 */
export function bandEdgeBoxes(band, t, inset) {
  const [x0, y0, x1, y1] = band
  const th = Math.max(0, Math.min(t, (y1 - y0) / 2))
  const a = Math.min(x0 + inset, (x0 + x1) / 2)
  const b = Math.max(x1 - inset, (x0 + x1) / 2)
  return [[a, y0, b, y0 + th], [a, y1 - th, b, y1]]
}

// ריווח המסגרת ועיגול הפינות כחלק מגובה השורה (ביחידות המקור — גדל ומתכווץ עם הזום);
// estimatedFill — מכפיל המילוי כשהמיקום משוער
export const WORD_FRAME = { padX: 0.4, padY: 0.25, radius: 0.25, estimatedFill: 0.75 }

/**
 * מלבן המסגרת סביב המילה: ריפוד יחסי לגובה השורה, ופינות מעוגלות ~רבע שורה.
 * @param {number[]} wb תיבת המילה
 * @param {number} lh גובה השורה (באותן יחידות; 0 — לפי גובה המילה)
 * @returns {{ box: number[], rx: number }}
 */
export function wordFrameBox(wb, lh) {
  const h = lh > 0 ? lh : Math.max(1, wb[3] - wb[1])
  const px = WORD_FRAME.padX * h
  const py = WORD_FRAME.padY * h
  return { box: [wb[0] - px, wb[1] - py, wb[2] + px, wb[3] + py], rx: WORD_FRAME.radius * h }
}

/**
 * שכבת המעקב על הצילום: SVG בפיקסלים הטבעיים של התמונה (width×height), שיושב בתוך העטיפה
 * המוגדלת של ImagePanel — כך שהזום חל עליה מעצמו. מציירת את פס השורה,
 * מסגרת המילה (מלבן מרווח: מילוי חם וקו דק רציף שמפוצה ב-1/zoom; קו תחתון כשיש רק תיבת
 * שורה) — ראו SCAN_HIGHLIGHT/wordFrameBox — ותג מספר השורה בשוליים. לחיצה על שורה/מילה (או ברווח שבין השורות) → onPick(שורה, מילה, נקודה).
 *
 * הקואורדינטות (lines/lineBox/wordBox) במרחב המקור — viewBox = sourceSize, ואם אין — ממדי
 * התמונה. עם interactive=false השכבה שקופה לעכבר כולה.
 *
 * @param {{ width: number, height: number, sourceSize?: [number, number]|null, zoom?: number,
 *   lines?: { bbox: number[], words?: { bbox: number[] }[] }[], lineBox?: number[]|null,
 *   wordBox?: number[]|null, kind?: 'solid'|'dashed'|'under'|null, lineNumber?: number|null,
 *   interactive?: boolean, onPick?: (line: number, word: number|null, point: { x: number, y: number }) => void, className?: string,
 *   strength?: 'normal'|'strong' }} props
 */
export default function ScanWordOverlay({
  width,
  height,
  sourceSize = null,
  zoom = 1,
  lines = [],
  lineBox = null,
  wordBox = null,
  kind = null,
  lineNumber = null,
  interactive = true,
  onPick,
  className,
  strength = 'strong'
}) {
  const hl = SCAN_HIGHLIGHT[strength] || SCAN_HIGHLIGHT.strong
  const motion = !useReducedMotion()
  const W = Array.isArray(sourceSize) && sourceSize[0] > 0 ? sourceSize[0] : width
  const H = Array.isArray(sourceSize) && sourceSize[1] > 0 ? sourceSize[1] : height
  // יחידות SVG לפיקסל מסך אחד
  const u = W / (width || W) / (zoom > 0 ? zoom : 1)
  const pickable = interactive && typeof onPick === 'function' && lines.length > 0
  // לחיצה ברווח שבין השורות נתפסת בשורה הקרובה
  const padY = useMemo(() => lineGapPad(lines), [lines])

  const handleClick = useCallback((e) => {
    if (!pickable) return
    const p = clientToSource(e.currentTarget, e.clientX, e.clientY, W, H)
    if (!p) return
    const { x, y } = p
    const hit = hitTestScan(lines, x, y, 6 * u, padY + 2 * u)
    if (!hit) return
    e.stopPropagation()
    // גם הנקודה עצמה — הסמן עובר למילה שהמעקב מסמן בדיוק בה (ראו caretTrack.offsetFromScan)
    onPick(hit.line, hit.word, { x, y })
  }, [pickable, lines, W, H, u, padY, onPick])

  const pad = width > 0 ? 10 * (W / width) : 0
  // אזורי הלחיצה של כל השורות (מאות מלבנים) — נבנים מחדש רק כשהשורות/הממדים משתנים, לא בכל
  // תזוזת סמן (בעמוד גוש זה היה רוב עבודת ה-React בהקשת חץ)
  const hitRects = useMemo(() => (pickable
    ? lines.map((l, i) =>
      isBox(l?.bbox) ? (
        <rect key={i} data-line={i} x={l.bbox[0] - pad} y={l.bbox[1] - padY} width={l.bbox[2] - l.bbox[0] + 2 * pad} height={l.bbox[3] - l.bbox[1] + 2 * padY} fill="transparent" />
      ) : null
    )
    : null), [pickable, lines, pad, padY])

  if (!(width > 0) || !(height > 0)) return null

  const band = isBox(lineBox) ? [lineBox[0] - pad, lineBox[1], lineBox[2] + pad, lineBox[3]] : null
  const bandG = band && geo(band, motion)
  const wb = isBox(wordBox) ? wordBox : null
  const estimated = kind !== 'solid'
  // גובה השורה לריווח המסגרת — מתיבת השורה, ואם אין — מתיבת המילה
  const lh = isBox(lineBox) ? lineBox[3] - lineBox[1] : wb ? wb[3] - wb[1] : 0
  const label = Number.isInteger(lineNumber) && lineNumber > 0 ? String(lineNumber) : null
  const badgeH = 22 * u
  const badgeW = Math.max(badgeH, (label ? label.length * 7.5 + 10 : 0) * u)
  const badgeX = band ? Math.min(band[2] + 8 * u, W - badgeW - 2 * u) : 0
  const badgeY = isBox(lineBox) ? (lineBox[1] + lineBox[3]) / 2 - badgeH / 2 : 0

  return (
    <svg
      data-scan-overlay=""
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={className}
      onClick={handleClick}
      style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      {pickable && (
        <g data-testid="scan-hit-lines" style={{ pointerEvents: 'all', cursor: 'pointer' }}>
          {hitRects}
        </g>
      )}

      {bandG && (
        <rect
          data-testid="scan-line-band"
          {...bandG.attrs}
          rx={6 * u}
          style={{ fill: BAND, fillOpacity: hl.band, mixBlendMode: 'multiply', ...bandG.style }}
        />
      )}
      {band && bandEdgeBoxes(band, u, 6 * u).map((e, i) => {
        const g = geo(e, motion)
        return (
          <rect
            key={i}
            data-testid="scan-line-band-edge"
            {...g.attrs}
            style={{ fill: BAND_EDGE, fillOpacity: hl.bandEdge, mixBlendMode: 'multiply', ...g.style }}
          />
        )
      })}

      {wb && kind === 'under' && (
        <line
          data-testid="scan-word-frame"
          data-kind="under"
          x1={wb[0]}
          x2={wb[2]}
          y1={wb[3] + 0.15 * lh}
          y2={wb[3] + 0.15 * lh}
          strokeWidth={hl.stroke * 1.5 * u}
          strokeLinecap="round"
          style={{ stroke: MARK_EDGE, strokeOpacity: hl.strokeOpacity, mixBlendMode: 'multiply' }}
        />
      )}
      {wb && kind !== 'under' && (() => {
        const f = wordFrameBox(wb, lh)
        const g = geo(f.box, motion)
        const fill = hl.fill * (estimated ? WORD_FRAME.estimatedFill : 1)
        // מילוי וקו באותה גאומטריה בדיוק — מלבן אחד; שניהם multiply, כך שהקו נבלע במילוי
        return (
          <g data-testid="scan-word">
            <rect
              data-testid="scan-word-fill"
              {...g.attrs}
              rx={f.rx}
              style={{ fill: MARK, fillOpacity: fill, mixBlendMode: 'multiply', ...g.style }}
            />
            <rect
              data-testid="scan-word-frame"
              data-kind={estimated ? 'estimated' : 'solid'}
              {...g.attrs}
              rx={f.rx}
              fill="none"
              strokeWidth={hl.stroke * u}
              style={{ stroke: MARK_EDGE, strokeOpacity: hl.strokeOpacity, mixBlendMode: 'multiply', ...g.style }}
            />
          </g>
        )
      })()}

      {label && band && (
        <g data-testid="scan-line-badge">
          <rect x={badgeX} y={badgeY} width={badgeW} height={badgeH} rx={badgeH / 2} style={{ fill: 'var(--color-primary)' }} />
          <text
            x={badgeX + badgeW / 2}
            y={badgeY + badgeH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12 * u}
            fontWeight={700}
            style={{ fill: 'var(--color-on-primary)', fontVariantNumeric: 'tabular-nums' }}
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  )
}

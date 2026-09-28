'use client'

/**
 * גרף השטח של ההספק השבועי — SVG ידני במקום Recharts.
 *
 * Recharts (כ-91KB gzip / 320KB raw של JavaScript, כולל d3 ו-redux) נטען בכל
 * כניסה לקטלוג /library/books רק כדי לצייר 7 נקודות. כאן: אותם סימוני ציר,
 * אותה עקומה (monotone X) ואותו tooltip, בלי תלות. החישובים הטהורים ב-
 * weeklyProgressGeometry.js (עם טסטים מול הערכים של Recharts/d3).
 *
 * מערכת הצירים זהה לפריסה הקודמת (margin top 5 / right 5 / left -25 ו-YAxis ברוחב
 * 60 -> אזור הגרף מתחיל 35px משמאל; XAxis בגובה 30px בתחתית).
 */

import { useId, useState } from 'react'
import { niceTicks, chartPoints, linePath, areaPath, nearestIndex } from './weeklyProgressGeometry'

const COLOR = '#6b5d4f'
const PLOT = { left: 35, right: 5, top: 5, bottom: 30 }
const AXIS_LABEL_CLASS = 'absolute whitespace-nowrap text-[10px] leading-none text-[#888] pointer-events-none'

function ChartTooltip({ point, value, placeLeft }) {
  return (
    // בכוונה בלי dir="rtl": יורש את ה-ltr של אזור הגרף, כמו ה-tooltip של Recharts —
    // כך המספר מוצג מימין למילה "דפים", בדיוק כמו קודם
    <div
      className="absolute top-0 whitespace-nowrap pointer-events-none z-10"
      style={{
        [placeLeft ? 'right' : 'left']: `calc(${placeLeft ? 100 - point.x : point.x}% + 10px)`,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #eee',
        borderRadius: '6px',
        fontSize: '12px',
        padding: '4px 8px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
        color: COLOR,
        fontWeight: 'bold'
      }}
    >
      {`${value} דפים`}
    </div>
  )
}

export default function WeeklyProgressArea({ data }) {
  const [activeIndex, setActiveIndex] = useState(null)
  const gradientId = `weekly-progress-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const values = data.map((d) => Number(d.count) || 0)
  const ticks = niceTicks(Math.max(0, ...values))
  const yMax = ticks[ticks.length - 1]
  const points = chartPoints(values, yMax)
  const active = activeIndex !== null ? points[activeIndex] : null

  const trackPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    setActiveIndex(nearestIndex((e.clientX - rect.left) / rect.width, points.length))
  }

  const plotHeight = `(100% - ${PLOT.top + PLOT.bottom}px)`
  const plotWidth = `(100% - ${PLOT.left + PLOT.right}px)`

  return (
    <div className="relative h-full w-full select-none">
      {ticks.map((tick) => (
        <span
          key={tick}
          className={AXIS_LABEL_CLASS}
          style={{
            right: `calc(100% - ${PLOT.left - 8}px)`,
            top: `calc(${PLOT.top}px + ${plotHeight} * ${1 - tick / yMax})`,
            transform: 'translateY(-50%)'
          }}
        >
          {tick}
        </span>
      ))}

      <div
        className="absolute touch-pan-y"
        style={PLOT}
        onPointerMove={trackPointer}
        onPointerDown={trackPointer}
        onPointerLeave={() => setActiveIndex(null)}
      >
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute inset-x-0 pointer-events-none"
            style={{ top: `${(1 - tick / yMax) * 100}%`, borderTop: '1px dashed #f0f0f0' }}
          />
        ))}

        <svg
          className="absolute inset-0 h-full w-full overflow-visible pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLOR} stopOpacity={0.2} />
              <stop offset="95%" stopColor={COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath(points)} fill={`url(#${gradientId})`} stroke="none" />
          <path
            d={linePath(points)}
            fill="none"
            stroke={COLOR}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {active && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px pointer-events-none"
              style={{ left: `${active.x}%`, backgroundColor: '#ccc' }}
            />
            <div
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{ left: `${active.x}%`, top: `${active.y}%`, backgroundColor: COLOR }}
            />
            <ChartTooltip
              point={active}
              value={values[activeIndex]}
              placeLeft={activeIndex > (points.length - 1) / 2}
            />
          </>
        )}
      </div>

      {data.map((d, i) => (
        <span
          key={d._id || i}
          className={AXIS_LABEL_CLASS}
          style={{
            left: `calc(${PLOT.left}px + ${plotWidth} * ${points[i].x / 100})`,
            top: `calc(100% - ${PLOT.bottom - 11}px)`,
            transform: 'translateX(-50%)'
          }}
        >
          {d.date}
        </span>
      ))}
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { nudgePanelSize, PANEL_SIZE } from './editorShellLogic'

/**
 * המפריד בין פאנל הצילום לפאנל הטקסט. גרירה ב-pointer events (עכבר, מגע ועט — setPointerCapture,
 * כך שהגרירה לא "נופלת" כשהאצבע יוצאת מהפס), ומקלדת: חצים (2%), Home/End.
 *
 * הגודל מחושב אצל ההורה (onPointerPosition מקבל את מיקום המצביע — ההורה יודע את מידות המכל),
 * ו-onCommit נקרא בסוף גרירה או אחרי מקש — לשמירה ב-localStorage.
 *
 * @param {{
 *   orientation: 'vertical'|'horizontal', swap?: boolean, value: number,
 *   onChange: (size: number) => void, onPointerPosition: (clientX: number, clientY: number) => void,
 *   onCommit?: (size: number) => void, onDraggingChange?: (dragging: boolean) => void, className?: string
 * }} props
 * orientation — כיוון הפריסה: 'vertical' = זה לצד זה (מפריד אנכי), 'horizontal' = אחד מעל השני.
 */
export default function PanelSplitter({ orientation, swap = false, value, onChange, onPointerPosition, onCommit, onDraggingChange, className }) {
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const sideBySide = orientation !== 'horizontal'

  const setDrag = (next) => {
    draggingRef.current = next
    setDragging(next)
    onDraggingChange?.(next)
  }

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag(true)
  }
  const onPointerMove = (event) => {
    if (!draggingRef.current) return
    onPointerPosition(event.clientX, event.clientY)
  }
  const endDrag = (event) => {
    if (!draggingRef.current) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setDrag(false)
    onCommit?.(value)
  }
  const onKeyDown = (event) => {
    const next = nudgePanelSize(value, event.key, { orientation, swap })
    if (next == null) return
    event.preventDefault()
    onChange(next)
    onCommit?.(next)
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={sideBySide ? 'vertical' : 'horizontal'}
      aria-label="גודל פאנל הצילום"
      aria-valuemin={PANEL_SIZE.min}
      aria-valuemax={PANEL_SIZE.max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`הצילום ${Math.round(value)}%`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={cx(
        'group relative z-(--z-raised) flex shrink-0 touch-none select-none items-center justify-center bg-outline-variant',
        sideBySide ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        FOCUS_RING,
        className
      )}
    >
      {/* אזור מגע רחב משני הצדדים של הקו (24px), בלי להזיז את הפריסה */}
      <span aria-hidden="true" className={cx('absolute', sideBySide ? 'inset-y-0 -inset-x-3' : 'inset-x-0 -inset-y-3')} />
      <span
        aria-hidden="true"
        className={cx(
          'relative rounded-(--radius-pill) transition-colors motion-reduce:transition-none',
          sideBySide ? 'h-10 w-1' : 'h-1 w-10',
          dragging ? 'bg-primary' : 'bg-outline group-hover:bg-primary'
        )}
      />
    </div>
  )
}

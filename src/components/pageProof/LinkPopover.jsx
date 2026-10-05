'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { placePopup } from '@/lib/pageProof/wordPopup'
import { linkBadge } from '@/lib/pageProof/flowEdit'
import { LINK_HE, isIncomingFar, linkEndLabel, linkKindHe, linkSourceHe, unlinkPlan } from '@/lib/pageProof/linkCancel'

// חלונית של קישור — נפתחת בלחיצה על המספר שאחרי המילה בטקסט (FlowEditor: LinkBadge). מה מקושר למה,
// אוטומטי או ידני, ושלוש פעולות: "עבור לצד השני", "✓ נכון" (לקישור אוטומטי) ו"בטל קישור" — לכל קישור,
// אוטומטי או ידני, גם לקישור שנוסף עכשיו (lib/pageProof/linkCancel.js: מה הביטול עושה בכל מקרה).
// נסגרת ב-Esc, בלחיצה מחוצה לה, בגלילה ואחרי פעולה. portal ל-document.body, position: fixed ליד המספר.
//
// props: view, link (מהתצוגה), n (המספר בעמוד), anchorRect (של המספר שנלחץ), readOnly,
//        onJump(), onOk(link), onUnlink(link), onClose()

export const LINK_POPUP_SELECTOR = '[data-proof-link-popup]'

const btn = 'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-colors disabled:cursor-default disabled:opacity-40'

export default function LinkPopover({ view, link, n, anchorRect = null, readOnly = false, onJump, onOk, onUnlink, onClose }) {
  const boxRef = useRef(null)
  const live = useRef({ onClose })
  useLayoutEffect(() => {
    live.current = { onClose }
  })

  // מיקום לפני הציור (כמו חלונית-ההצעות — WordSuggestions)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const { top, left, above } = placePopup(
      anchorRect || { left: 0, top: 0, right: 0, bottom: 0 },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    )
    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.dataset.above = above ? 'true' : 'false'
  })

  // Esc (בשלב-הלכידה — לפני העורך), לחיצה מחוץ לחלונית (לא על מספר-קישור: הוא פותח/סוגר בעצמו), גלילה
  useEffect(() => {
    const close = () => live.current.onClose?.()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    const onDown = (e) => {
      const t = e.target instanceof Element ? e.target : null
      if (t && (boxRef.current?.contains(t) || t.closest('[data-link-n]'))) return
      close()
    }
    const onScroll = (e) => {
      if (e.target instanceof Node && boxRef.current?.contains(e.target)) return
      close()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  if (!link || typeof document === 'undefined') return null
  const plan = unlinkPlan(view, link)
  const canOk = !readOnly && link.src !== 'human' && !link._added && link.to_line != null && !isIncomingFar(link, view?.page)

  return createPortal(
    <div
      ref={boxRef}
      data-proof-link-popup=""
      role="dialog"
      aria-label={`קישור ${n}`}
      dir="rtl"
      style={{ position: 'fixed' }}
      className="z-[60] w-72 rounded-lg border border-surface-variant bg-white p-2 text-sm text-on-surface shadow-xl"
      // הסמן והבחירה נשארים בעורך: לחיצה בחלונית אינה לוקחת פוקוס
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="mb-1 flex items-center gap-1 border-b border-surface-variant pb-1 text-xs text-on-surface/70">
        <span className="font-bold text-info-700">{linkBadge(n)}</span>
        <span className="flex-1">
          קישור · {linkKindHe(link)} · {linkSourceHe(link)}
          {link._added ? ' · נוסף עכשיו' : ''}
        </span>
        <button type="button" onClick={onClose} aria-label="סגירה" title="סגירה (Esc)" className="rounded px-1 text-on-surface/60 hover:bg-surface-variant">
          ✕
        </button>
      </div>
      <div className="space-y-0.5 text-right">
        <div>{linkEndLabel(view, 'from', link)}</div>
        <div className="text-xs text-on-surface/60">← {linkEndLabel(view, 'to', link)}</div>
      </div>
      {link.suspect && <div className="mt-1 text-xs text-danger-700">{link.suspect}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" onClick={onJump} className={`${btn} bg-surface-variant/70 text-on-surface hover:bg-surface-variant`}>
          עבור לצד השני
        </button>
        {canOk && (
          <button type="button" onClick={() => onOk?.(link)} className={`${btn} bg-success-100 text-success-800 hover:bg-success-200`}>
            ✓ נכון
          </button>
        )}
        {plan.action === 'far' ? (
          <span className="text-xs text-on-surface/60">{plan.hint}</span>
        ) : (
          <button
            type="button"
            disabled={readOnly || plan.action === 'none'}
            onClick={() => onUnlink?.(link)}
            title={LINK_HE.unlinkTitle}
            className={`${btn} bg-danger-600 text-white hover:bg-danger-700`}
          >
            ✗ {LINK_HE.unlink}
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}

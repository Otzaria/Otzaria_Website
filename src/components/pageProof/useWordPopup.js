'use client'

import { createElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { popupReducer, POPUP_CLOSED, POPUP_OPEN_DELAY_MS, POPUP_CLOSE_DELAY_MS } from '@/lib/pageProof/popupState'
import { hasSuggestions, moveActive, popupWordKey, suggestionData } from '@/lib/pageProof/wordPopup'
import WordSuggestions, { WORD_POPUP_SELECTOR } from './WordSuggestions'

// חלונית ההצעות למילה: מתי נפתחת ומתי נסגרת. הכללים — ב-popupState.js
// (טהור, עם בדיקות); כאן הטיימרים והאירועים של הדפדפן:
// • ריחוף של 250ms על מילה מסומנת (יש לה חלופות או חשד של מודל-השפה) — פותח.
// • עזיבת המילה ועזיבת החלונית — סגירה אחרי 180ms, אלא אם העכבר נכנס בינתיים
//   לחלונית או חזר למילה (מעבר מהמילה לחלונית אינו סוגר).
// • Escape, גלילה של מה שמכיל את המילה, שינוי גודל-החלון, מעבר לחלון/לשונית
//   אחרים, הסמן שעוזב את המילה, ובחירת הצעה — סוגרים מיד.
// • פתיחה מהמקלדת (openKeyboard / onWordEnter עם {keyboard:true}): מיד, בלי
//   ריחוף; ↑↓ מסמנים הצעה, Enter מחליף, Esc סוגר — והמקשים אינם מגיעים לעורך.
//
// useWordPopup(view, {onPick(lineId, i, word), readOnly?, lockedLineIds?}) →
//   {onWordEnter(lineId, i, rect, opts?), onWordLeave(lineId?, i?),
//    onCaretMove(lineId, wordIndex), closeNow(), popup,
//    openKeyboard(lineId, i, rect?) → האם יש מה להציע, isOpen, openKey}
// popup = אלמנט React (portal) שיש לרנדר איפשהו בעץ של העורך.

const CLOSED = { p: POPUP_CLOSED, anchor: null, active: -1 }

// המצב = מצב-החלונית (popupState) + המילה שעליה היא פתוחה + ההצעה המסומנת
function reducer(s, a) {
  switch (a.type) {
    case 'hover':
      // העכבר נכנס למילה: אם החלונית שלה פתוחה — ביטול הסגירה הממתינה; אחרת
      // אין שינוי (טיימר-הפתיחה יפתח)
      return s.p.open && s.p.wordKey === a.key ? { ...s, p: popupReducer(s.p, { type: 'enterWord', key: a.key }) } : s
    case 'open': {
      const { anchor, keyboard } = a
      if (!keyboard && s.p.open && s.p.wordKey === anchor.key) return { ...s, p: popupReducer(s.p, { type: 'enterWord', key: anchor.key }) }
      return { p: popupReducer(s.p, { type: keyboard ? 'openKeyboard' : 'enterWord', key: anchor.key }), anchor, active: keyboard ? 0 : -1 }
    }
    case 'active':
      return s.p.open && s.active !== a.index ? { ...s, active: a.index } : s
    default: {
      const p = popupReducer(s.p, a)
      if (p === s.p) return s
      return p.open ? { ...s, p } : CLOSED
    }
  }
}

const findLine = (view, lineId) => (view?.lines || []).find((l) => l?.id === lineId) || null

// המילה ב-DOM של העורך (FlowEditor: <span data-line> ובתוכו <span data-w>)
function wordElement(lineId, i) {
  if (typeof document === 'undefined' || !Number.isFinite(Number(lineId)) || !Number.isInteger(i)) return null
  return document.querySelector(`[data-line="${Number(lineId)}"] [data-w="${i}"]`)
}

function plainRect(r) {
  if (!r || typeof r.left !== 'number') return null
  const right = typeof r.right === 'number' ? r.right : r.left + (r.width || 0)
  const bottom = typeof r.bottom === 'number' ? r.bottom : r.top + (r.height || 0)
  return { left: r.left, top: r.top, right, bottom }
}

const rectOf = (lineId, i, fallback) => plainRect(wordElement(lineId, i)?.getBoundingClientRect()) || plainRect(fallback)

export function useWordPopup(view, { onPick = null, readOnly = false, lockedLineIds = null } = {}) {
  const [s, dispatch] = useReducer(reducer, CLOSED)
  const baseId = useId()
  const openTimer = useRef(null)
  const openKey = useRef(null) // המילה שטיימר-הפתיחה שלה רץ
  const hoverKey = useRef(null) // המילה שהעכבר עליה עכשיו
  const caretKey = useRef(undefined) // המילה של הסמן בדיווח הקודם
  const pressed = useRef(false) // כפתור-העכבר לחוץ (גרירת בחירה) — לא פותחים
  const latest = useRef({ view })

  useLayoutEffect(() => {
    latest.current = { view }
  })

  const cancelOpen = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = null
    openKey.current = null
  }, [])

  // העכבר נכנס למילה (או פתיחה מהמקלדת). מחזיר true אם יש למילה הצעות.
  const onWordEnter = useCallback(
    (lineId, wordIndex, rect, opts) => {
      const keyboard = opts === true || opts?.keyboard === true
      const key = popupWordKey(lineId, wordIndex)
      if (!keyboard) hoverKey.current = key
      cancelOpen()
      if (!Number.isInteger(wordIndex) || wordIndex < 0) return false
      if (!hasSuggestions(findLine(latest.current.view, lineId), wordIndex)) return false
      if (keyboard) {
        dispatch({ type: 'open', keyboard: true, anchor: { key, lineId, i: wordIndex, rect: rectOf(lineId, wordIndex, rect) } })
        return true
      }
      dispatch({ type: 'hover', key })
      openKey.current = key
      openTimer.current = setTimeout(() => {
        openTimer.current = null
        openKey.current = null
        if (pressed.current) return
        dispatch({ type: 'open', anchor: { key, lineId, i: wordIndex, rect: rectOf(lineId, wordIndex, rect) } })
      }, POPUP_OPEN_DELAY_MS)
      return true
    },
    [cancelOpen]
  )

  // העכבר עזב מילה. בלי ארגומנטים — המילה האחרונה שנכנס אליה.
  const onWordLeave = useCallback(
    (lineId, wordIndex) => {
      const key = lineId != null && Number.isInteger(wordIndex) ? popupWordKey(lineId, wordIndex) : hoverKey.current
      if (key == null) return
      if (key === hoverKey.current) hoverKey.current = null
      if (key === openKey.current) cancelOpen()
      dispatch({ type: 'leaveWord', key })
    },
    [cancelOpen]
  )

  // הסמן זז (FlowEditor → onCaret). רק שינוי אמיתי של המילה נחשב — דיווח חוזר
  // על אותו מקום (למשל שחזור הבחירה אחרי רינדור) אינו סוגר חלונית של ריחוף.
  const onCaretMove = useCallback((lineId, wordIndex) => {
    const key = lineId != null && Number.isInteger(wordIndex) && wordIndex >= 0 ? popupWordKey(lineId, wordIndex) : null
    if (key === caretKey.current) return
    caretKey.current = key
    dispatch({ type: 'caretMove', key })
  }, [])

  const closeNow = useCallback(() => {
    cancelOpen()
    dispatch({ type: 'escape' })
  }, [cancelOpen])

  const openKeyboard = useCallback((lineId, wordIndex, rect) => onWordEnter(lineId, wordIndex, rect, { keyboard: true }), [onWordEnter])

  // ---- מה מוצג ----
  const { anchor, active } = s
  const keyboard = !!s.p.keyboard
  const data = useMemo(() => (s.p.open && anchor ? suggestionData(findLine(view, anchor.lineId), anchor.i) : null), [view, s.p.open, anchor])
  const open = !!(s.p.open && data && data.items.length)
  const count = data?.items.length ?? 0
  const locked = !!(anchor && lockedLineIds && typeof lockedLineIds.has === 'function' && lockedLineIds.has(anchor.lineId))
  const disabledReason =
    readOnly || typeof onPick !== 'function'
      ? 'תצוגה בלבד — אי אפשר להחליף כאן'
      : locked
        ? 'השורה ממתינה לזיהוי מחדש — אין טעם לתקן בה עכשיו'
        : null

  // בחירת הצעה (לחיצה או Enter). בלי גישה ל-refs — הפונקציה עוברת לחלונית בזמן
  // הרינדור; טיימר-פתיחה ממתין כבר בוטל כשהעכבר עזב את מילתו בדרך לחלונית.
  const choose = useCallback(
    (index) => {
      const item = data?.items?.[index]
      if (!item || !anchor || disabledReason || typeof onPick !== 'function') return false
      dispatch({ type: 'pick' })
      onPick(anchor.lineId, anchor.i, item.text)
      return true
    },
    [data, anchor, disabledReason, onPick]
  )

  // המצב "פתוח" אבל אין מה להציג — המילה שונתה (הוקלדה בה אות), השורה הוסרה
  // או עברה לשונית: סוגרים גם את המצב. אחרת, כשההצעות חוזרות (Ctrl+Z), החלונית
  // הייתה צצה שוב במקום הישן ונשארת פתוחה גם כשהעכבר כבר רחוק.
  useEffect(() => {
    if (!s.p.open || open) return
    cancelOpen()
    dispatch({ type: 'escape' })
  }, [s.p.open, open, cancelOpen])

  // טיימר-הסגירה: כל עוד יש סגירה ממתינה (עזיבת מילה/חלונית). כניסה בחזרה
  // מבטלת אותה (pendingClose=false) ← הניקוי מבטל את הטיימר.
  useEffect(() => {
    if (!s.p.open || !s.p.pendingClose) return undefined
    const t = setTimeout(() => dispatch({ type: 'closeTimer' }), POPUP_CLOSE_DELAY_MS)
    return () => clearTimeout(t)
  }, [s.p.open, s.p.pendingClose])

  // מקלדת כשהחלונית פתוחה: Esc תמיד; ↑↓/Enter רק כשנפתחה מהמקלדת. במאזין
  // capture על window — לפני העורך, כדי שהמקשים לא יזיזו את הסמן/יפצלו פסקה.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dispatch({ type: 'escape' })
      } else if (!keyboard) {
        return
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        dispatch({ type: 'active', index: moveActive(active, e.key === 'ArrowDown' ? 1 : -1, count) })
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        if (!choose(active)) dispatch({ type: 'escape' })
      } else if (e.key === 'Tab') {
        dispatch({ type: 'escape' })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, keyboard, active, count, choose])

  // סגירה מיידית: גלילה של מה שמכיל את המילה (לא גלילה בתוך החלונית ולא של
  // לוח אחר, כמו הסריקה), שינוי גודל, מעבר לחלון/לשונית אחרים
  useEffect(() => {
    if (!open) return undefined
    const onScroll = (e) => {
      const t = e.target
      if (t instanceof Element && t.closest(WORD_POPUP_SELECTOR)) return
      const el = anchor ? wordElement(anchor.lineId, anchor.i) : null
      if (el && t instanceof Element && !t.contains(el)) return
      dispatch({ type: 'scroll' })
    }
    const onResize = () => dispatch({ type: 'scroll' })
    const onBlur = () => dispatch({ type: 'blur' })
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') dispatch({ type: 'blur' })
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [open, anchor])

  // גרירת בחירה עם העכבר — לא פותחים חלונית באמצע. שחרור מחוץ לחלון אינו
  // שולח mouseup, ולכן גם תנועה בלי כפתור לחוץ מאפסת (אחרת החלונית לא הייתה
  // נפתחת יותר עד הלחיצה הבאה).
  useEffect(() => {
    const down = (e) => {
      if (e.button === 0) pressed.current = true
    }
    const up = () => {
      pressed.current = false
    }
    const move = (e) => {
      if (pressed.current && e.buttons === 0) pressed.current = false
    }
    window.addEventListener('mousedown', down, true)
    window.addEventListener('mouseup', up, true)
    window.addEventListener('mousemove', move, { capture: true, passive: true })
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('mousedown', down, true)
      window.removeEventListener('mouseup', up, true)
      window.removeEventListener('mousemove', move, { capture: true })
      window.removeEventListener('blur', up)
    }
  }, [])

  useEffect(() => () => cancelOpen(), [cancelOpen])

  const popup = open
    ? createElement(WordSuggestions, {
        id: `proof-word-popup-${baseId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        data,
        anchorRect: anchor.rect,
        keyboard,
        activeIndex: active,
        disabledReason,
        onPick: choose,
        onMouseEnter: () => dispatch({ type: 'enterPopup' }),
        onMouseLeave: () => dispatch({ type: 'leavePopup' }),
        // בעכבר הסימון הוא CSS (hover) — בלי רינדור של כל העורך בכל ריחוף;
        // במקלדת העכבר מזיז גם את הסימון של ↑↓
        onActiveChange: keyboard ? (index) => dispatch({ type: 'active', index }) : undefined,
      })
    : null

  return { onWordEnter, onWordLeave, onCaretMove, closeNow, openKeyboard, popup, isOpen: open, openKey: open ? anchor.key : null }
}

export default useWordPopup

'use client'

/**
 * FramesEditor — עורך המסגרות של עמוד אחד בגלאי האזורים (docs/75 ה-8…ה-10; docs/76 §4.3, §5.3).
 * רכיב אחד לשלושה מצבים, כדי שמסך הסקירה של המנהל (סשן ד') ישתמש באותו עורך בדיוק:
 *
 *   mode="edit"     — המתנדב: ציור בגרירה על מקום ריק, הזזה, הגדלה/הקטנה מכל קצה ופינה, הצמדה לדיו,
 *                     זרם/תפקיד/ממשיך/סדר-קריאה/מחיקה, ו-Enter = onConfirm. הצעת המודל (src:'auto') שעוד
 *                     לא נגעו בה נצמדת לדיו בטעינה (בלי שמירה — רק כשמשנים משהו או מאשרים).
 *                     הסוג של מסגרת-טקסט בזרם נקבע לפי הזרם (streamRoles.js); סדר-הקריאה משתנה גם מלוח-הצד
 *                     ("מוקדם יותר"/"מאוחר יותר", Alt+↑/↓) בלי לעבור למצב "סדר הקריאה" (O).
 *   mode="review"   — המנהל: אותה עריכה ("תקן ואשר"), בלי הצמדה בטעינה; compare מוצג כרקע אפור מקווקו.
 *   mode="readOnly" — רק תצוגה: בחירת מסגרת מציגה את פרטיה, אין שינוי.
 *
 * props:
 *   mode        'edit' | 'review' | 'readOnly'                                     (ברירת-מחדל: 'edit')
 *   page        {id, w, h, img, frames, state?}  — img = כתובת התמונה בגודל המלא (אותו מקור — ההצמדה קוראת
 *               את הפיקסלים שלה); frames = מסגרות בצורת החוזה {fid, kind, role, box, stream, ord, cont, obj?, src}.
 *               העורך מחזיק עותק משלו: כדי לטעון עמוד אחר מחליפים key (<FramesEditor key={page.id} …/>).
 *   streams     [{id, name, role, added?}] — רשימת-הזרמים של הספר
 *   onChange    (frames, {save, reason}) — אחרי כל שינוי. save:false = רק עדכון-תצוגה (הצמדה בטעינה) — לא לשמור
 *   onConfirm   (frames) — Enter / "העמוד נכון". בלי — Enter לא עושה כלום
 *   onAddStream (name, role) → Promise<stream> — "זרם חדש לספר"; בלי — הכפתור לא מוצג
 *   compare     frames | null — מסגרות להשוואה (למשל הצעת המודל בסקירה), מצוירות אפור מקווקו מתחת
 *   snap, onSnapChange — הצמדה לדיו (מבוקר מבחוץ, כדי שיישאר בין עמודים); בלי snap — פנימי, דולק
 *   snapOnLoad  boolean — הצמדת הצעת-המודל בטעינה (ברירת-מחדל: רק ב-edit ורק בעמוד 'proposed')
 *   keyboard    boolean — האזנה למקלדת בחלון (ברירת-מחדל: true). כשיש כמה עורכים בדף — רק אחד true
 *   sideExtra   ReactNode — בתחתית לוח-הצד (כפתורי "העמוד נכון"/הבא/דלג של הדף המארח)
 *   toolbarExtra ReactNode — בסוף סרגל-הכלים
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import FramePanel from './FramePanel'
import { ROLE_COLORS, ROLE_LABELS, ROLE_BY_KEY } from './look'
import {
  hitTest,
  cursorFor,
  moveBox,
  resizeBox,
  normRect,
  clampBox,
  bigEnough,
  withRole,
  streamSeq,
  nextFid,
  nextOrd,
  renumber,
  applyOrder,
  moveInOrder,
  moveToPlace,
  moveInStream,
  NO_STREAM_ROLES,
} from './geometry'
import { applyRole, applyStream, syncRoles } from './streamRoles'
import { snapBox, snapProposal, gridsFromRGBA, analyzeSize } from './inkSnap'

const HIT_PX = 8 // מרחק-התפיסה של קצה, בפיקסלי-מסך
const MIN_DRAW_PX = 6 // מסגרת קטנה מזה (בפיקסלי-מסך) = לחיצה, לא ציור
const ZOOMS = [1, 1.5, 2, 3]
const UNDO_MAX = 50

// רשתות-הדיו לפי כתובת-תמונה — מעבר בין עמודים לא מחשב שוב
const gridCache = new Map()
function computeGrids(img, url) {
  if (gridCache.has(url)) return gridCache.get(url)
  const W = img.naturalWidth
  const H = img.naturalHeight
  if (!W || !H) return null
  const { w, h } = analyzeSize(W, H)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const cx = cv.getContext('2d', { willReadFrequently: true })
  cx.drawImage(img, 0, 0, w, h)
  const g = gridsFromRGBA(cx.getImageData(0, 0, w, h).data, w, h, W, H)
  gridCache.set(url, g)
  if (gridCache.size > 8) gridCache.delete(gridCache.keys().next().value)
  return g
}

const isTyping = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
const pct = (v, n) => `${(v / n) * 100}%`

export default function FramesEditor({
  mode = 'edit',
  page,
  streams = [],
  onChange,
  onConfirm,
  onAddStream,
  compare = null,
  snap: snapProp,
  onSnapChange,
  snapOnLoad,
  keyboard = true,
  sideExtra = null,
  toolbarExtra = null,
  className = '',
}) {
  const W = page.w
  const H = page.h
  const editable = mode === 'edit' || mode === 'review'
  // מסגרות-טקסט בזרם — בתפקיד שהזרם קובע (רק תצוגה; נשמר כשמשנים משהו או מאשרים, והשרת קובע אותו שוב)
  const [frames, setFrames] = useState(() => (editable ? syncRoles(page.frames || [], streams) : page.frames || []))
  // העותק העדכני — כל setFrames מעדכן גם אותו, כדי שהאירועים (עכבר, מקלדת) יראו את המצב בלי לחכות לרינדור
  const framesRef = useRef(frames)
  const [sel, setSel] = useState(null)
  const [tool, setTool] = useState('edit') // edit | order
  const [clicked, setClicked] = useState([])
  const [rubber, setRubber] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [snapLocal, setSnapLocal] = useState(true)
  const snap = snapProp ?? snapLocal
  const setSnap = (v) => (onSnapChange ? onSnapChange(v) : setSnapLocal(v))
  const [grid, setGrid] = useState(null)
  const [imgError, setImgError] = useState(false)
  const wrapRef = useRef(null)
  const imgRef = useRef(null)
  const drag = useRef(null)
  const undo = useRef([])
  const pick = useRef({ role: 'body', stream: streams.find((s) => s.role === 'body')?.id ?? streams[0]?.id ?? null })
  const loadSnapped = useRef(false)

  const commit = useCallback(
    (next, reason, before = framesRef.current) => {
      undo.current.push(before)
      if (undo.current.length > UNDO_MAX) undo.current.shift()
      framesRef.current = next
      setFrames(next)
      onChange?.(next, { save: true, reason })
    },
    [onChange]
  )

  // ההצמדה לדיו צריכה את הפיקסלים: מחשבים פעם אחת לכל תמונה, אחרי שהיא נטענה ומוצגת
  const onImgLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setTimeout(() => {
      try {
        setGrid(computeGrids(img, page.img))
      } catch {
        setGrid(null)
      }
    }, 20)
  }, [page.img])

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth) onImgLoad()
  }, [onImgLoad])

  // הצעת המודל נצמדת לדיו בטעינה (ה-10) — רק תצוגה; נשמר כשמשנים משהו או מאשרים
  const wantLoadSnap = snapOnLoad ?? (mode === 'edit' && (page.state ?? 'proposed') === 'proposed')
  useEffect(() => {
    if (!grid || !snap || !wantLoadSnap || loadSnapped.current) return
    loadSnapped.current = true
    const next = framesRef.current.map((f) =>
      f.src === 'auto' ? { ...f, box: clampBox(snapProposal(grid, f.box, { isObj: f.kind === 'object', pageH: H }), W, H) } : f
    )
    framesRef.current = next
    setFrames(next)
    onChange?.(next, { save: false, reason: 'snap-load' })
  }, [grid, snap, wantLoadSnap, W, H, onChange])

  // הסוג של זרם השתנה (או זרם נוסף): המסגרות שלו מקבלות את הסוג החדש. השרת כבר שמר — כאן רק התצוגה
  useEffect(() => {
    if (!editable) return
    const next = syncRoles(framesRef.current, streams)
    if (next === framesRef.current) return
    framesRef.current = next
    setFrames(next)
    onChange?.(next, { save: false, reason: 'roles' })
  }, [streams, editable, onChange])

  const fit = useCallback(
    (box, isObj, sides) => clampBox(snap && grid ? snapBox(grid, box, { isObj, pageH: H, sides }) : box.map((v) => Math.round(v)), W, H),
    [snap, grid, W, H]
  )

  // ---------------------------------------------------------------- שינויים במסגרת הנבחרת
  const patchSel = useCallback(
    (patch, reason = 'patch') => {
      if (!editable || !sel) return
      const next = framesRef.current.map((f) =>
        f.fid !== sel ? f : 'stream' in patch ? applyStream({ ...f, ...patch }, patch.stream, streams) : { ...f, ...patch, src: 'human' }
      )
      commit(next, reason)
      const f = next.find((x) => x.fid === sel)
      if (f && 'stream' in patch && patch.stream) {
        pick.current.stream = patch.stream
        pick.current.role = f.role
      }
    },
    [editable, sel, commit, streams]
  )
  const setRole = useCallback(
    (role, opts) => {
      if (!editable || !sel) return
      const next = framesRef.current.map((f) => (f.fid === sel ? applyRole(f, role, streams, opts) : f))
      commit(next, 'role')
      const f = next.find((x) => x.fid === sel)
      pick.current.role = role
      if (f?.stream) pick.current.stream = f.stream
    },
    [editable, sel, commit, streams]
  )
  const deleteSel = useCallback(() => {
    if (!editable || !sel) return
    commit(renumber(framesRef.current.filter((f) => f.fid !== sel)), 'delete')
    setSel(null)
  }, [editable, sel, commit])

  // ---------------------------------------------------------------- סדר הקריאה תוך כדי עבודה (לוח-הצד, Alt+↑/↓)
  const reorder = useCallback(
    (fn, reason = 'order') => {
      if (!editable || !sel) return
      const next = fn(framesRef.current, sel)
      if (next !== framesRef.current) commit(next, reason)
    },
    [editable, sel, commit]
  )
  const moveSel = useCallback((d) => reorder((fr, fid) => moveInOrder(fr, fid, d)), [reorder])
  const placeSel = useCallback((k) => reorder((fr, fid) => moveToPlace(fr, fid, k)), [reorder])
  const streamMoveSel = useCallback((d) => reorder((fr, fid) => moveInStream(fr, fid, d)), [reorder])

  // ---------------------------------------------------------------- סדר הקריאה (O)
  const endOrder = useCallback(
    (list = clicked) => {
      if (list.length) commit(applyOrder(framesRef.current, list), 'order')
      setClicked([])
      setTool('edit')
    },
    [clicked, commit]
  )
  const startOrder = useCallback(() => {
    if (!editable || !framesRef.current.length) return
    setSel(null)
    setClicked([])
    setTool('order')
  }, [editable])
  const orderClick = useCallback(
    (fid) => {
      if (clicked.includes(fid)) return
      const list = [...clicked, fid]
      if (list.length >= framesRef.current.length) endOrder(list)
      else setClicked(list)
    },
    [clicked, endOrder]
  )

  // ---------------------------------------------------------------- העכבר
  const toPage = (e) => {
    const r = wrapRef.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, k: W / r.width }
  }
  const cursorMode = !editable ? 'readOnly' : tool === 'order' ? 'order' : 'edit'

  const onPointerDown = (e) => {
    if (e.button !== 0 || imgError) return
    // עבודה על העמוד מחזירה את המקלדת לעורך: כפתור שנלחץ קודם (עמוד ממוזער, תפקיד) לא "בולע" את Enter
    const act = document.activeElement
    if (act && act !== document.body && !isTyping(act)) act.blur()
    const p = toPage(e)
    const h = hitTest(framesRef.current, p, HIT_PX * p.k)
    if (!editable) {
      setSel(h?.fid ?? null)
      return
    }
    if (tool === 'order') {
      if (h) orderClick(h.fid)
      return
    }
    e.preventDefault()
    wrapRef.current.setPointerCapture?.(e.pointerId)
    if (!h) {
      drag.current = { kind: 'new', p0: p }
      setRubber([p.x, p.y, p.x, p.y])
      return
    }
    setSel(h.fid)
    const f = framesRef.current.find((x) => x.fid === h.fid)
    drag.current = { kind: h.edge ? 'edge' : 'move', ed: h.ed, fid: h.fid, p0: p, o: f.box, before: framesRef.current, moved: false }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    const p = toPage(e)
    if (!d) {
      wrapRef.current.style.cursor = cursorFor(hitTest(framesRef.current, p, HIT_PX * p.k), cursorMode)
      return
    }
    if (d.kind === 'new') {
      setRubber(clampBox(normRect(d.p0.x, d.p0.y, p.x, p.y), W, H))
      return
    }
    const dx = p.x - d.p0.x
    const dy = p.y - d.p0.y
    if (!d.moved && Math.abs(dx) / p.k < 2 && Math.abs(dy) / p.k < 2) return
    d.moved = true
    const box = d.kind === 'move' ? moveBox(d.o, dx, dy, W, H) : resizeBox(d.o, d.ed, dx, dy, W, H)
    const next = framesRef.current.map((f) => (f.fid === d.fid ? { ...f, box } : f))
    framesRef.current = next
    setFrames(next)
  }

  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const p = toPage(e)
    if (d.kind === 'new') {
      setRubber(null)
      const r = clampBox(normRect(d.p0.x, d.p0.y, p.x, p.y), W, H)
      if (!bigEnough(r, MIN_DRAW_PX * p.k)) {
        setSel(null)
        return
      }
      const role = pick.current.role
      const base = {
        fid: nextFid(framesRef.current),
        kind: 'text',
        role: 'body',
        box: r,
        stream: null,
        ord: nextOrd(framesRef.current),
        cont: false,
        src: 'human',
      }
      let f = withRole(base, role)
      if (!NO_STREAM_ROLES.includes(f.role)) {
        const st = streams.some((s) => s.id === pick.current.stream) ? pick.current.stream : null
        f = { ...applyStream(f, st, streams), src: 'human' }
      }
      f = { ...f, box: fit(r, f.kind === 'object') }
      commit([...framesRef.current, f], 'draw')
      setSel(f.fid)
      return
    }
    if (!d.moved) return
    const cur = framesRef.current.find((f) => f.fid === d.fid)
    const box = d.kind === 'edge' ? fit(cur.box, cur.kind === 'object', d.ed) : cur.box.map((v) => Math.round(v))
    commit(
      framesRef.current.map((f) => (f.fid === d.fid ? { ...f, box, src: 'human' } : f)),
      d.kind === 'edge' ? 'resize' : 'move',
      d.before
    )
  }

  const onPointerCancel = () => {
    const d = drag.current
    drag.current = null
    setRubber(null)
    if (d?.before) {
      framesRef.current = d.before
      setFrames(d.before)
    }
  }

  // ---------------------------------------------------------------- המקלדת
  useEffect(() => {
    if (!keyboard) return undefined
    const onKey = (e) => {
      if (isTyping(e.target) || e.defaultPrevented) return
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        if (!editable || !undo.current.length) return
        e.preventDefault()
        const prev = undo.current.pop()
        framesRef.current = prev
        setFrames(prev)
        onChange?.(prev, { save: true, reason: 'undo' })
        return
      }
      if (e.ctrlKey || e.metaKey) return
      if (e.key === 'Enter') {
        // Enter על כפתור/קישור — הכפתור עצמו פועל, לא "העמוד נכון"
        if (['BUTTON', 'A'].includes(e.target?.tagName)) return
        if (tool === 'order') {
          e.preventDefault()
          endOrder()
        } else if (onConfirm) {
          e.preventDefault()
          onConfirm(framesRef.current)
        }
        return
      }
      if (e.key === 'Escape') {
        if (tool === 'order') endOrder()
        else setSel(null)
        return
      }
      if (!editable) return
      if (e.code === 'KeyO' && !e.altKey) {
        e.preventDefault()
        if (tool === 'order') endOrder()
        else startOrder()
        return
      }
      if (e.code === 'KeyS' && !e.altKey) {
        e.preventDefault()
        setSnap(!snap)
        return
      }
      if (!sel || tool === 'order') return
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        moveSel(e.key === 'ArrowUp' ? -1 : 1)
        return
      }
      const dm = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
      if (dm && e.altKey) {
        const s = streams[+dm[1] - 1]
        const f = framesRef.current.find((x) => x.fid === sel)
        e.preventDefault()
        if (s && f && !NO_STREAM_ROLES.includes(f.role)) patchSel({ stream: s.id }, 'stream')
        return
      }
      if (dm) {
        e.preventDefault()
        setRole(ROLE_BY_KEY[dm[1]])
        return
      }
      if (e.code === 'KeyC') {
        const f = framesRef.current.find((x) => x.fid === sel)
        e.preventDefault()
        if (f && !NO_STREAM_ROLES.includes(f.role)) patchSel({ cont: !f.cont }, 'cont')
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------------------------------------------------------------- התצוגה
  const shown = useMemo(() => (tool === 'order' ? applyOrder(frames, clicked) : frames), [tool, frames, clicked])
  const seq = useMemo(() => streamSeq(shown), [shown])
  const streamName = useMemo(() => Object.fromEntries(streams.map((s) => [s.id, s.name])), [streams])
  const selFrame = frames.find((f) => f.fid === sel) || null
  const hint =
    tool === 'order'
      ? `לחצו על המסגרות לפי סדר הקריאה — הבאה: ${clicked.length + 1}. Esc או Enter מסיימים (מה שלא נלחץ — אחרי, בסדר הקודם).`
      : editable
        ? 'גרירה על מקום ריק מציירת מסגרת · גרירת מסגרת מזיזה אותה · בקצה או בפינה — הגדלה והקטנה · הסדר — בלוח שבצד'
        : 'לחיצה על מסגרת מציגה את פרטיה'

  const label = (f) => {
    if (tool === 'order' && !clicked.includes(f.fid)) return '·'
    const tail = f.stream && streamName[f.stream] ? `${streamName[f.stream]} ${seq.get(f.fid) ?? ''}` : ROLE_LABELS[f.role]
    return `${f.ord ?? '?'} · ${tail}`
  }

  return (
    <div className={`grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] ${className}`} data-testid="frames-editor" data-mode={mode}>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <div className="inline-flex overflow-hidden rounded-pill border border-outline" role="group" aria-label="מצב העבודה">
                <button
                  type="button"
                  aria-pressed={tool === 'edit'}
                  onClick={() => (tool === 'order' ? endOrder() : null)}
                  className={`inline-flex items-center gap-1 px-3 py-1 text-label-md font-bold ${tool === 'edit' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`}
                >
                  <AppIcon name="edit" className="text-base" /> ציור ועריכה
                </button>
                <button
                  type="button"
                  aria-pressed={tool === 'order'}
                  onClick={() => (tool === 'order' ? endOrder() : startOrder())}
                  className={`inline-flex items-center gap-1 px-3 py-1 text-label-md font-bold ${tool === 'order' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`}
                >
                  <AppIcon name="format_list_numbered" className="text-base" /> סדר הקריאה <kbd className="text-label-sm opacity-80">O</kbd>
                </button>
              </div>
            )}
            {editable && (
              <label
                className="inline-flex items-center gap-1.5 text-label-md"
                title="כשההצמדה דולקת, מסגרת שמציירים או שמשנים את גודלה נצמדת לקצוות הדיו שבתוכה"
              >
                <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} data-testid="snap-toggle" />
                הצמדה לדיו <kbd className="rounded border border-outline-variant px-1 text-label-sm">S</kbd>
                {snap && !grid && !imgError && <span className="text-on-surface-variant">(מכין…)</span>}
              </label>
            )}
            <div className="inline-flex items-center gap-0.5" role="group" aria-label="הגדלה">
              <button
                type="button"
                aria-label="הקטן"
                disabled={zoom === ZOOMS[0]}
                onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}
                className="rounded-control p-1 text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
              >
                <AppIcon name="zoom_out" className="text-xl" />
              </button>
              <span className="w-10 text-center text-label-md tabular-nums">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                aria-label="הגדל"
                disabled={zoom === ZOOMS.at(-1)}
                onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}
                className="rounded-control p-1 text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
              >
                <AppIcon name="zoom_in" className="text-xl" />
              </button>
            </div>
            {toolbarExtra}
          </div>
          <span className="text-label-md text-on-surface-variant" data-testid="editor-hint">
            {hint}
          </span>
        </div>

        <div className="max-h-[80vh] overflow-auto rounded-control border border-outline-variant bg-surface-container-low">
          {/* ריווח עליון: מספר המסגרת מוצג מעל המסגרת, גם במסגרת שצמודה לראש העמוד */}
          <div className="mx-auto pt-6" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? 720 : undefined }}>
            <div
              ref={wrapRef}
              className="relative touch-none select-none bg-surface"
              style={{ aspectRatio: `${W} / ${H}` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              data-testid="page-surface"
            >
              <img
                ref={imgRef}
                src={page.img}
                alt={`עמוד ${page.page ?? ''}`}
                draggable={false}
                onLoad={onImgLoad}
                onError={() => setImgError(true)}
                className="pointer-events-none block h-full w-full"
              />
              {imgError && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface text-body-md text-error">
                  <AppIcon name="error" className="me-1" /> התמונה לא נטענה
                </div>
              )}
              {compare?.map((f) => (
                <div
                  key={`c-${f.fid}`}
                  className="pointer-events-none absolute border border-dashed border-outline"
                  style={{ left: pct(f.box[0], W), top: pct(f.box[1], H), width: pct(f.box[2] - f.box[0], W), height: pct(f.box[3] - f.box[1], H) }}
                />
              ))}
              {shown.map((f) => {
                const on = f.fid === sel
                return (
                  <div
                    key={f.fid}
                    data-fid={f.fid}
                    data-testid="frame"
                    className="absolute"
                    style={{
                      '--c': ROLE_COLORS[f.role] || ROLE_COLORS.body,
                      left: pct(f.box[0], W),
                      top: pct(f.box[1], H),
                      width: pct(f.box[2] - f.box[0], W),
                      height: pct(f.box[3] - f.box[1], H),
                      border: `${on ? 3 : 2}px ${f.src === 'auto' ? 'dashed' : 'solid'} var(--c)`,
                      background: 'color-mix(in srgb, var(--c) 9%, transparent)',
                      boxShadow: on ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--c)' : undefined,
                      zIndex: on ? 2 : 1,
                    }}
                  >
                    <span
                      className="absolute bottom-[calc(100%+1px)] start-[-2px] cursor-pointer whitespace-nowrap rounded-t-[5px] px-1.5 text-label-sm font-bold leading-snug text-on-primary"
                      style={{ background: 'var(--c)' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        if (editable && tool === 'order') orderClick(f.fid)
                        else setSel(f.fid)
                      }}
                      data-testid="frame-label"
                    >
                      {label(f)}
                    </span>
                    {f.cont && (
                      <span className="absolute bottom-[-2px] end-[-2px] px-1 text-label-sm font-bold text-on-primary" style={{ background: 'var(--c)' }}>
                        ממשיך ←
                      </span>
                    )}
                  </div>
                )
              })}
              {rubber && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                  style={{ left: pct(rubber[0], W), top: pct(rubber[1], H), width: pct(rubber[2] - rubber[0], W), height: pct(rubber[3] - rubber[1], H) }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="rounded-card bg-surface p-3.5 shadow-raised">
          <FramePanel
            frame={selFrame}
            frames={frames}
            streams={streams}
            readOnly={!editable}
            onPatch={(p) => patchSel(p, 'stream' in p ? 'stream' : 'patch')}
            onSetRole={setRole}
            onDelete={deleteSel}
            onSelect={tool === 'order' ? undefined : setSel}
            onMove={moveSel}
            onPlace={placeSel}
            onStreamMove={streamMoveSel}
            onAddStream={mode === 'edit' ? onAddStream : undefined}
          />
        </div>
        {sideExtra}
      </aside>
    </div>
  )
}

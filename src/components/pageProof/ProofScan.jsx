'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { streamInfo } from '@/lib/pageProof/vocab'
import { hitFrame, hitLine } from '@/lib/pageProof/view'
import {
  MIN_BOX_PX,
  POPOVER_CLEAR,
  pageSize,
  clientToImage,
  isDrag,
  zoomStep,
  zoomAnchorScroll,
  defaultZoomAnchor,
  normBox,
  clampBox,
  boxOk,
  resizeOk,
  moveBoxWithin,
  resizeBoxCorner,
  handleRects,
  caretMarker,
  scrollToReveal,
  alignScroll,
  wordBoxOf,
  popoverBeside,
  badgeAnchor,
  frameLabel,
  isObjectFrame,
} from '@/lib/pageProof/scanGeometry'

// משטח-הסריקה: תמונת-העמוד ומעליה SVG במרחב הפיקסלים של התמונה (viewBox =
// doc.size) — כל קואורדינטה של החוזה מצוירת כמות-שהיא, והזום הוא רק גודל
// ה-SVG. הרכיב "טיפש": הוא מצייר ומתרגם עכבר לאירועים; את המצב ואת הפעולות
// מחזיק ScanPanel (הוא המשתמש היחיד).
//
// Props:
//   view            התצוגה (buildView) — size, lines
//   imageUrl        תמונת-העמוד
//   zoom            פיקסלי-מסך לפיקסל-תמונה
//   mode            'frames' — מסגרות בלבד (בלי תיבות-שורה) | 'lines' — תיבות-השורות
//   tool            frames: 'select' | 'draw';  lines: 'select' | 'split' | 'add'
//   frames          המסגרות לציור [{fid, stream, bbox, order, kind?}] (של העמוד או ההצעה)
//   suggested       המסגרות הן הצעת המחשב — מקווקוות, עם "הצעה"
//   seqs            Map fid → המספר בזרם (seqInStream)
//   selectedFid     המסגרת הנבחרת (ידיות בפינות ובצדדים, ב-select)
//   selectedIds     Set/מערך — השורות הנבחרות (lines)
//   resizeLineId    השורה שמקבלת ידיות בפינות ובצדדים (lines + select)
//   recutIds        Set — שורות "לזיהוי מחדש" (כתום מקווקו + תווית)
//   straddleIds     Set — שורות שבולטות מהמסגרות (אדום מקווקו, גם במצב מסגרות)
//   outsideIds      Set — שורות-תוכן מחוץ לכל מסגרת (כתום מקווקו, במצב מסגרות)
//   furniture       [{id, bbox, stream}] — שורות-ריהוט בלי מסגרת (furnitureMarks): אפור מקווקו
//                   ותווית "ריהוט", במצב מסגרות — כדי שלא יציירו להן מסגרת חדשה
//   currentLineId   השורה של הסמן בטקסט — פס שקוף + חץ בקצה המסגרת
//   currentWord     מספר המילה של הסמן בשורה (אינדקס ב-words[]; אין = -1) — מודגשת
//                   על הסריקה לפי words[i].bbox, בשני המצבים
//   caretY          ה-clientY של ראש השורה של הסמן בלוח-הטקסט (null — הסמן זז מלחיצה
//                   על הסריקה): הסריקה נגללת כך שראש תיבת-השורה יעמוד מולו — בחלק; לא
//                   בזמן שהמשתמש גורר או גולל את הסריקה. בלעדיו — גלילה רק כשהשורה חתוכה
//                   או מחוץ לחלון, ולא מיד אחרי לחיצה על הסריקה עצמה
//   readOnly        בלי גרירות-עריכה (לחיצה עדיין מדווחת)
//   drawColor       צבע המלבן בציור מסגרת
//   overlay         ReactNode בתוך שכבת-התוכן (החלונית של המסגרת). עם overlayFor (מזהה
//                   המסגרת) הרכיב ממקם אותו מחוץ למסגרת — לצדה, או מעליה/מתחתיה, איפה
//                   שיש מקום בחלון; בלוח צר — לצדה ברוחב שיש שם (popoverBeside) — ומסתיר
//                   אותו בזמן גרירה/שינוי-גודל של מסגרת
//   svgLayer        (רשות, לדף עוטף) שכבה בתוך ה-SVG, במרחב הפיקסלים של התמונה, מתחת לסמן:
//                   ReactNode או ({zoom, mode, view}) => ReactNode; בלי אירועי-עכבר
// אירועים (נקודות בפיקסלי-תמונה; תיבות תקינות לחוזה — שלמות ובתוך התמונה):
//   onClick({point, frame, line, additive, at})  לחיצה בלי גרירה; frame — רק ב-frames.
//     לחיצה על ידית בלי גרירה אינה לחיצה
//   onDraw(box, at)                          ציור (frames+draw / lines+add)
//     at = {point, x, y, w, h} — הנקודה בתמונה, ומקום האירוע בחלון-הגלילה ומידותיו
//   onBand(box, additive)                    בחירה בגרירה (lines+select)
//   onFrameBox(fid, box)                     הזזה/שינוי-גודל של המסגרת הנבחרת
//   onLineBox(id, box)                       שינוי-גודל של תיבת-שורה
//   onZoom(nextZoom)                         Ctrl+גלגלת (העוגן — הנקודה שמתחת לעכבר)

const EMPTY = new Set()
const EMPTY_LIST = []
const OBJECT_COLOR = '#6b7280'
// סמן שזז בגלל לחיצה על הסריקה (בתוך הזמן הזה אחריה) — בלי גלילה-אוטומטית
const PICK_NO_REVEAL_MS = 800
// המשתמש גלל את הסריקה בעצמו (גלגלת/מגע/פס-הגלילה) — בזמן הזה אחריו הסריקה לא עוקבת אחרי הסמן
const USER_SCROLL_QUIET_MS = 900
// גודל-החלונית המשוער לפני שנמדדה (סביבת-בדיקות / הציור הראשון)
const OVERLAY_EST = { width: 300, height: 190 }
const HANDLE_CURSOR = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
}

// מקום החלונית לפי המסגרת, החלק הגלוי של הסריקה וגודל החלונית כפי שנמדד (בלי מידות —
// סביבת-בדיקות — לפי ההערכה). cur = {ovBox, ovKey, zoom, W, H}; natural = ref לרוחב
// הטבעי של החלונית — נמדד רק כשהיא אינה מצומצמת (אחרת הצמצום היה "מזין את עצמו").
// מחזיר {left, top, side, width?, key} — width: ברוחב הזה מציירים אותה (צומצמה כדי לשבת
// לצד המסגרת)
function overlayPlacement(el, pop, cur, natural) {
  const { ovBox: box, ovKey: key, zoom: z, W: w, H: h } = cur || {}
  if (!el || !pop || !box || !key) return null
  const vp = { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth || w * z, height: el.clientHeight || h * z }
  if (!pop.style.width && pop.offsetWidth > 0) natural.current = pop.offsetWidth
  const size = { width: natural.current || OVERLAY_EST.width, height: pop.offsetHeight || OVERLAY_EST.height }
  return { ...popoverBeside(box, z, vp, size, { clear: POPOVER_CLEAR }), key }
}
const samePlace = (a, b) => (a && a.key === b.key && a.left === b.left && a.top === b.top && a.width === b.width ? a : null)

const asSet = (v) => (v instanceof Set ? v : new Set(v || []))
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)
const inBox = (b, [x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
const rectProps = (b) => ({ x: b[0], y: b[1], width: Math.max(0, b[2] - b[0]), height: Math.max(0, b[3] - b[1]) })

export default function ProofScan({
  view,
  imageUrl,
  zoom = 1,
  mode = 'frames',
  tool = 'select',
  frames = [],
  suggested = false,
  seqs = null,
  selectedFid = null,
  selectedIds = EMPTY,
  resizeLineId = null,
  recutIds = EMPTY,
  straddleIds = EMPTY,
  outsideIds = EMPTY,
  furniture = EMPTY_LIST,
  currentLineId = null,
  currentWord = -1,
  caretY = null,
  readOnly = false,
  drawColor = '#1a56db',
  overlay = null,
  overlayFor = null,
  svgLayer = null,
  onClick,
  onDraw,
  onBand,
  onFrameBox,
  onLineBox,
  onZoom,
}) {
  const [W, H] = pageSize(view)
  const lines = view?.lines || []
  const u = 1 / zoom
  const scroller = useRef(null)
  const svgRef = useRef(null)
  const drag = useRef(null)
  const tempRef = useRef(null)
  // "הסריקה נלחצה זה עתה" — בזמן הזה הסמן זז בגלל הלחיצה, ולא גוללים אליו
  const justPicked = useRef(false)
  const pickTimer = useRef(null)
  useEffect(() => () => clearTimeout(pickTimer.current), [])
  // המשתמש גולל/לוחץ על הסריקה בעצמו — מעקב-הסמן לא "נאבק" בו
  const userScrollAt = useRef(0)
  const pointerIn = useRef(false)
  const [temp, setTempState] = useState(null) // {kind:'draw'|'band'|'frame'|'line', box, fid?, id?}
  const [hover, setHover] = useState(null) // קו-הפיצול: {id, x}
  const [imgFailed, setImgFailed] = useState(false)
  const setTemp = (t) => {
    tempRef.current = t
    setTempState(t)
  }

  // המסגרת שהחלונית שלה פתוחה, והתיבה שלה (החלונית ממוקמת מחוץ לה)
  const ovFrame = overlay && overlayFor != null ? frames.find((f) => f.fid === overlayFor) || null : null
  const ovBox = ovFrame && isBox(ovFrame.bbox) ? ovFrame.bbox : null
  const ovKey = ovBox ? `${ovFrame.fid}|${ovBox.join(',')}|${zoom}` : null
  const ovRef = useRef(null)
  const ovNatural = useRef(0) // הרוחב הטבעי של החלונית (בלי צמצום)
  const [ovPos, setOvPos] = useState(null) // {left, top, side, width?, key}
  const ovWidth = ovPos?.width ?? null

  // הערכים העדכניים למאזינים הילידיים (גלגלת, מדידת-גודל) ולאפקטים
  const latest = useRef({ zoom, onZoom, lines, ovBox, ovKey, W, H })
  useLayoutEffect(() => {
    latest.current = { zoom, onZoom, lines, ovBox, ovKey, W, H }
  })

  // ---- זום: שמירת נקודת-העוגן במקומה ----
  const prevZoom = useRef(zoom)
  const wheelAnchor = useRef(null)
  useLayoutEffect(() => {
    const el = scroller.current
    const z0 = prevZoom.current
    prevZoom.current = zoom
    if (!el || z0 === zoom) return
    const vp = { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }
    const a = wheelAnchor.current || defaultZoomAnchor(vp, z0)
    wheelAnchor.current = null
    const s = zoomAnchorScroll(a, zoom)
    el.scrollLeft = s.left
    el.scrollTop = s.top
  }, [zoom])

  // Ctrl+גלגלת — מאזין ילידי לא-פסיבי (ב-React onWheel פסיבי ואי-אפשר למנוע את זום-הדפדפן).
  // כל גלגלת/מגע/לחיצה על הסריקה (כולל פס-הגלילה) נרשמים כפעולת-משתמש: מעקב-הסמן ממתין
  useEffect(() => {
    const el = scroller.current
    if (!el) return undefined
    const mark = () => {
      userScrollAt.current = Date.now()
    }
    const onWheel = (e) => {
      mark()
      const { zoom: z, onZoom: cb } = latest.current
      if (!(e.ctrlKey || e.metaKey) || !cb) return
      e.preventDefault()
      const next = zoomStep(z, e.deltaY < 0 ? 1 : -1)
      if (next === z) return
      const r = el.getBoundingClientRect()
      const vx = e.clientX - r.left
      const vy = e.clientY - r.top
      wheelAnchor.current = { img: [(el.scrollLeft + vx) / z, (el.scrollTop + vy) / z], view: [vx, vy] }
      cb(next)
    }
    const onDown = () => {
      pointerIn.current = true
      mark()
    }
    const onUp = () => {
      if (!pointerIn.current) return
      pointerIn.current = false
      mark()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', mark, { passive: true })
    el.addEventListener('touchmove', mark, { passive: true })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', mark)
      el.removeEventListener('touchmove', mark)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // ---- השורה של הסמן ----
  // • caretY (הסמן זז בטקסט): ראש תיבת-השורה נגלל מול ראש השורה של הסמן בלוח-הטקסט,
  //   והמילה של הסמן לתוך החלון (אופקית) — אלא אם המשתמש גורר/גולל את הסריקה עכשיו.
  //   רק המילה זזה (הקלדה באותה שורה, באותו גובה) — בלי יישור-מחדש: המילה נגללת לחלון רק
  //   אם אינה בו, כך שהסריקה לא "נמשכת" חזרה אחרי שהמשתמש גלל אותה בעצמו;
  // • בלעדיו: גלילה חלקה רק כשהשורה חתוכה או מחוץ לחלון — ולא אחרי לחיצה על הסריקה:
  //   השורה שנבחרה שם כבר מול העיניים, וגלילה "מושכת" את הדף מתחת לעכבר
  const aligned = useRef({ lineId: null, y: null })
  useEffect(() => {
    const el = scroller.current
    if (currentLineId == null || !el || drag.current || !(el.clientHeight > 0)) return
    const line = latest.current.lines.find((l) => l.id === currentLineId)
    if (!isBox(line?.bbox)) return
    const z = latest.current.zoom
    const vp = { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }
    const wordBox = wordBoxOf(line, currentWord)
    let t = null
    if (Number.isFinite(caretY)) {
      if (pointerIn.current || Date.now() - userScrollAt.current < USER_SCROLL_QUIET_MS) return
      const a = aligned.current
      if (a.lineId === currentLineId && a.y === caretY) {
        t = scrollToReveal(wordBox || line.bbox, z, vp)
      } else {
        const r = el.getBoundingClientRect()
        const max = { left: el.scrollWidth - el.clientWidth, top: el.scrollHeight - el.clientHeight }
        t = alignScroll(line.bbox, z, vp, caretY - r.top, max, { wordBox })
        aligned.current = { lineId: currentLineId, y: caretY }
      }
    } else {
      aligned.current = { lineId: null, y: null }
      if (justPicked.current) return
      t = scrollToReveal(line.bbox, z, vp)
    }
    if (t && typeof el.scrollTo === 'function') el.scrollTo({ ...t, behavior: 'smooth' })
  }, [currentLineId, caretY, currentWord])

  // ---- החלונית של המסגרת: מחוץ למסגרת, בתוך החלק הגלוי של הסריקה ----
  // נמדדת מחדש כשהיא נפתחת, כשהמסגרת זזה/משנה גודל, בזום, וכשגודל החלונית או הלוח משתנה —
  // לא בגלילה (היא "צמודה" למסגרת וגוללת איתה). אחרי שהרוחב שלה השתנה (צומצמה כדי לשבת
  // לצד המסגרת, או חזרה לרוחבה) — עוד מדידה לפני הציור: השורות נשברו והגובה אחר
  useLayoutEffect(() => {
    if (!ovKey) return
    const p = overlayPlacement(scroller.current, ovRef.current, latest.current, ovNatural)
    if (p) setOvPos((prev) => samePlace(prev, p) || p)
  }, [ovKey, ovWidth])
  useEffect(() => {
    if (!ovKey || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => {
      const p = overlayPlacement(scroller.current, ovRef.current, latest.current, ovNatural)
      if (p) setOvPos((prev) => samePlace(prev, p) || p)
    })
    if (ovRef.current) ro.observe(ovRef.current)
    if (scroller.current) ro.observe(scroller.current)
    return () => ro.disconnect()
  }, [ovKey])

  // ---- עכבר ----
  const toImg = (e) => clientToImage(e, svgRef.current?.getBoundingClientRect?.(), W, H, zoom)
  const frameById = (fid) => frames.find((f) => f.fid === fid)
  const lineById = (id) => lines.find((l) => l.id === id)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    const p = toImg(e)
    const target = e.target
    const handle = target?.getAttribute?.('data-handle')
    const hFid = target?.getAttribute?.('data-fid')
    const hLine = target?.getAttribute?.('data-line')
    const d = { kind: 'click', start: p, client: [e.clientX, e.clientY], additive: e.shiftKey || e.ctrlKey || e.metaKey, dragging: false }
    const hf = hFid ? frameById(hFid) : null
    const hl = hLine != null ? lineById(Number(hLine)) : null
    if (!readOnly && handle && hf) Object.assign(d, { kind: 'frame-resize', fid: hf.fid, corner: handle, orig: hf.bbox })
    else if (!readOnly && handle && isBox(hl?.bbox)) Object.assign(d, { kind: 'line-resize', id: hl.id, corner: handle, orig: hl.bbox })
    else if (mode === 'frames') {
      const sel = selectedFid ? frameById(selectedFid) : null
      if (tool === 'draw' && !readOnly) d.kind = 'draw'
      else if (!readOnly && sel && inBox(sel.bbox, p)) Object.assign(d, { kind: 'frame-move', fid: sel.fid, orig: sel.bbox })
      else Object.assign(d, { kind: 'pan', scroll: [scroller.current?.scrollLeft || 0, scroller.current?.scrollTop || 0] })
    } else if (tool === 'add' && !readOnly) d.kind = 'draw'
    else if (tool === 'select') d.kind = 'band'
    drag.current = d
    if (hover) setHover(null)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* דפדפן בלי לכידת-מצביע — הגרירה עדיין עובדת כל עוד העכבר בתוך הסריקה */
    }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) {
      if (mode === 'lines' && tool === 'split' && !readOnly) {
        const p = toImg(e)
        const l = hitLine(
          lines.filter((x) => x.status !== 'removed'),
          p
        )
        const next = l ? { id: l.id, x: Math.round(p[0]) } : null
        if (next?.id !== hover?.id || next?.x !== hover?.x) setHover(next)
      }
      return
    }
    if (d.kind === 'click') return
    if (!d.dragging) {
      if (!isDrag(d.client, [e.clientX, e.clientY])) return
      d.dragging = true
    }
    if (d.kind === 'pan') {
      const el = scroller.current
      if (el) {
        el.scrollLeft = d.scroll[0] - (e.clientX - d.client[0])
        el.scrollTop = d.scroll[1] - (e.clientY - d.client[1])
      }
      return
    }
    const p = toImg(e)
    const delta = [p[0] - d.start[0], p[1] - d.start[1]]
    if (d.kind === 'draw' || d.kind === 'band') {
      setTemp({ kind: d.kind, box: normBox(d.start, [Math.min(W, Math.max(0, p[0])), Math.min(H, Math.max(0, p[1]))]) })
    } else if (d.kind === 'frame-move') {
      setTemp({ kind: 'frame', fid: d.fid, box: moveBoxWithin(d.orig, delta, W, H) })
    } else if (d.kind === 'frame-resize') {
      setTemp({ kind: 'frame', fid: d.fid, box: resizeBoxCorner(d.orig, d.corner, delta, W, H) })
    } else if (d.kind === 'line-resize') {
      setTemp({ kind: 'line', id: d.id, box: resizeBoxCorner(d.orig, d.corner, delta, W, H) })
    }
  }

  // מקום האירוע בחלון-הגלילה (פיקסלי-מסך) + הנקודה בתמונה — לשם ממקמים את החלונית
  const atOf = (e, p) => {
    const el = scroller.current
    const r = el?.getBoundingClientRect?.()
    return {
      point: [Math.round(p[0]), Math.round(p[1])],
      x: r ? e.clientX - r.left : 0,
      y: r ? e.clientY - r.top : 0,
      w: el?.clientWidth || 0,
      h: el?.clientHeight || 0,
    }
  }

  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    const t = tempRef.current
    if (t) setTemp(null)
    if (!d) return
    const min = MIN_BOX_PX / zoom
    if (d.dragging) {
      if (d.kind === 'draw') {
        if (t && boxOk(t.box, min)) onDraw?.(clampBox(t.box, W, H), atOf(e, toImg(e)))
      } else if (d.kind === 'band') {
        if (t) onBand?.(clampBox(t.box, W, H), d.additive)
      } else if (d.kind === 'frame-move') {
        // הזזה אינה משנה את הגודל — גם מסגרת דקה (שורה אחת בזום קטן) זזה
        if (t && boxOk(t.box, 1)) onFrameBox?.(d.fid, clampBox(t.box, W, H))
      } else if (d.kind === 'frame-resize') {
        if (t && resizeOk(d.orig, t.box, d.corner, min)) onFrameBox?.(d.fid, clampBox(t.box, W, H))
      } else if (d.kind === 'line-resize') {
        if (t && resizeOk(d.orig, t.box, d.corner, min)) onLineBox?.(d.id, clampBox(t.box, W, H))
      }
      return
    }
    // לחיצה על ידית בלי גרירה — לא "לחיצה על המסגרת": שום דבר לא נפתח ולא זז
    if (d.kind === 'frame-resize' || d.kind === 'line-resize') return
    const p = toImg(e)
    justPicked.current = true
    clearTimeout(pickTimer.current)
    pickTimer.current = setTimeout(() => {
      justPicked.current = false
    }, PICK_NO_REVEAL_MS)
    onClick?.({
      point: [Math.round(p[0]), Math.round(p[1])],
      frame: mode === 'frames' ? hitFrame(frames, p, 6 / zoom) : null,
      line: hitLine(lines, p),
      additive: d.additive,
      at: atOf(e, p),
    })
  }

  const onPointerCancel = () => {
    drag.current = null
    if (tempRef.current) setTemp(null)
  }

  const onPointerLeave = () => {
    if (hover && !drag.current) setHover(null)
  }

  // ---- ציור ----
  const frameBox = (f) => (temp?.kind === 'frame' && temp.fid === f.fid ? temp.box : f.bbox)
  const lineBox = (l) => (temp?.kind === 'line' && temp.id === l.id ? temp.box : l.bbox)
  const selSet = asSet(selectedIds)
  const recut = asSet(recutIds)
  const straddle = asSet(straddleIds)
  const outside = asSet(outsideIds)
  const marker = caretMarker(view, mode === 'frames' ? frames : [], currentLineId, { size: 12 * u, gap: 3 * u })
  const caretLine = marker ? lineById(marker.lineId) : null
  const wordBox = caretLine ? wordBoxOf(caretLine, currentWord) : null
  const dash = (a, b) => `${a * u} ${b * u}`
  const frameColor = (f) => (isObjectFrame(f) ? OBJECT_COLOR : streamInfo(view, f.stream).color)
  const selFrame = selectedFid ? frameById(selectedFid) : null
  const resizeLine = resizeLineId != null ? lineById(resizeLineId) : null
  const hoverLine = hover ? lineById(hover.id) : null

  const cursor =
    (mode === 'frames' && tool === 'draw') || (mode === 'lines' && tool === 'add')
      ? 'cursor-crosshair'
      : mode === 'lines' && tool === 'split'
        ? 'cursor-col-resize'
        : ''

  // ידיות שינוי-הגודל: ארבע פינות וארבעה אמצעי-צלעות (צלע — משנה רק את הצלע שלה)
  const handles = (b, attrs, stroke) =>
    handleRects(b, zoom).map((r) => (
      <rect
        key={r.handle}
        data-handle={r.handle}
        {...attrs}
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        rx={1.5 * u}
        fill="#fff"
        stroke={stroke}
        strokeWidth={1.5 * u}
        className={HANDLE_CURSOR[r.handle]}
      />
    ))
  // החלונית: גלויה רק אחרי שמוקמה, ומוסתרת בזמן גרירה/שינוי-גודל של מסגרת (חוזרת אחריה)
  const ovShown = !!ovKey && ovPos?.key === ovKey && temp?.kind !== 'frame'

  return (
    <div className="relative h-full w-full" data-testid="proof-scan">
      {imgFailed && (
        <div className="absolute inset-x-0 top-2 z-20 mx-auto w-fit rounded bg-danger-100 px-3 py-1 text-sm text-danger-700" dir="rtl">
          תמונת-העמוד לא נטענה
        </div>
      )}
      <div ref={scroller} className="h-full w-full overflow-auto" dir="ltr">
        <div className="relative" style={{ width: W * zoom, height: H * zoom }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width={W * zoom}
            height={H * zoom}
            role="img"
            aria-label="סריקת העמוד"
            className={`absolute inset-0 block select-none ${cursor}`}
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
          >
            <image href={imageUrl} x="0" y="0" width={W} height={H} preserveAspectRatio="none" onError={() => setImgFailed(true)} />

            {mode === 'frames' && (
              <g data-layer="frames">
                {frames.map((f) => {
                  const b = frameBox(f)
                  if (!isBox(b)) return null
                  const color = frameColor(f)
                  const isSel = f.fid === selectedFid
                  return (
                    <rect
                      key={f.fid}
                      data-frame={f.fid}
                      {...rectProps(b)}
                      fill={color}
                      fillOpacity={isSel ? 0.1 : 0.04}
                      stroke={color}
                      strokeWidth={(isSel ? 3 : 2) * u}
                      strokeDasharray={suggested || isObjectFrame(f) ? dash(7, 4) : undefined}
                      className={!readOnly && isSel && tool === 'select' ? 'cursor-move' : 'cursor-pointer'}
                    />
                  )
                })}
                {(furniture || []).filter((m) => isBox(m.bbox)).map((m) => (
                  <rect
                    key={`f${m.id}`}
                    data-furniture={m.id}
                    {...rectProps(m.bbox)}
                    className="fill-neutral-400/10 stroke-neutral-500"
                    strokeWidth={1.25 * u}
                    strokeDasharray={dash(2, 3)}
                    pointerEvents="none"
                  />
                ))}
                {lines
                  .filter((l) => straddle.has(l.id) && isBox(l.bbox))
                  .map((l) => (
                    <rect
                      key={`s${l.id}`}
                      data-straddle={l.id}
                      {...rectProps(l.bbox)}
                      className="fill-none stroke-danger-600"
                      strokeWidth={1.5 * u}
                      strokeDasharray={dash(5, 3)}
                      pointerEvents="none"
                    />
                  ))}
                {lines
                  .filter((l) => outside.has(l.id) && !straddle.has(l.id) && isBox(l.bbox))
                  .map((l) => (
                    <rect
                      key={`o${l.id}`}
                      data-outside={l.id}
                      {...rectProps(l.bbox)}
                      className="fill-warning-500/10 stroke-warning-600"
                      strokeWidth={1.5 * u}
                      strokeDasharray={dash(5, 3)}
                      pointerEvents="none"
                    />
                  ))}
              </g>
            )}

            {mode === 'lines' && (
              <g data-layer="lines">
                {lines.map((l) => {
                  const b = lineBox(l)
                  if (!isBox(b)) return null
                  const removed = l.status === 'removed'
                  const isRecut = recut.has(l.id) && !removed
                  const isSel = selSet.has(l.id)
                  const cls = isSel
                    ? 'stroke-primary fill-primary/15'
                    : removed
                      ? 'stroke-neutral-400 fill-none'
                      : isRecut
                        ? 'stroke-warning-600 fill-warning-500/10'
                        : l.recheck
                          ? 'stroke-neutral-500 fill-warning-alt-300/40'
                          : 'stroke-neutral-500 fill-none'
                  return (
                    <rect
                      key={l.id}
                      data-line-box={l.id}
                      data-recut={isRecut ? '1' : undefined}
                      data-removed={removed ? '1' : undefined}
                      {...rectProps(b)}
                      className={cls}
                      strokeWidth={(isSel ? 2.5 : 1.25) * u}
                      strokeOpacity={removed ? 0.7 : 1}
                      strokeDasharray={removed || isRecut ? dash(5, 3) : undefined}
                      pointerEvents="none"
                    />
                  )
                })}
              </g>
            )}

            {svgLayer && (
              <g data-layer="extra" pointerEvents="none">
                {typeof svgLayer === 'function' ? svgLayer({ zoom, mode, view }) : svgLayer}
              </g>
            )}

            {marker && (
              <g data-testid="caret-marker" pointerEvents="none">
                <rect {...rectProps(marker.band)} fill={marker.color} fillOpacity={0.18} />
                <polygon points={marker.arrow.map((pt) => pt.join(',')).join(' ')} fill={marker.color} />
              </g>
            )}

            {/* המילה של הסמן בטקסט — כמו מרקר צהוב על הסריקה */}
            {wordBox && (
              <rect
                data-testid="word-highlight"
                {...rectProps(wordBox)}
                rx={2 * u}
                className="fill-warning-alt-300/50 stroke-warning-alt-700"
                strokeWidth={2 * u}
                pointerEvents="none"
              />
            )}

            {mode === 'frames' && tool === 'select' && !readOnly && selFrame && isBox(frameBox(selFrame)) &&
              handles(frameBox(selFrame), { 'data-fid': selFrame.fid }, frameColor(selFrame))}

            {mode === 'lines' && tool === 'select' && !readOnly && isBox(resizeLine?.bbox) &&
              handles(lineBox(resizeLine), { 'data-line': resizeLine.id }, '#1c1b1a')}

            {mode === 'lines' && tool === 'split' && hover && isBox(hoverLine?.bbox) && (
              <line
                data-testid="split-guide"
                x1={hover.x}
                x2={hover.x}
                y1={hoverLine.bbox[1] - 6 * u}
                y2={hoverLine.bbox[3] + 6 * u}
                className="stroke-danger-600"
                strokeWidth={2 * u}
                strokeDasharray={dash(4, 2)}
                pointerEvents="none"
              />
            )}

            {temp && (temp.kind === 'draw' || temp.kind === 'band') && (
              <rect
                {...rectProps(temp.box)}
                {...(temp.kind === 'draw' && mode === 'frames'
                  ? { fill: drawColor, fillOpacity: 0.08, stroke: drawColor }
                  : { className: temp.kind === 'band' ? 'stroke-info-600 fill-info-500/10' : 'stroke-warning-600 fill-warning-500/10' })}
                strokeWidth={1.5 * u}
                strokeDasharray={dash(6, 4)}
                pointerEvents="none"
              />
            )}
          </svg>

          {/* תוויות (HTML, בפיקסלי-מסך — קריאות בכל זום) */}
          <div className="pointer-events-none absolute inset-0" dir="rtl">
            {mode === 'frames' &&
              frames.map((f) => {
                const b = frameBox(f)
                if (!isBox(b)) return null
                const a = badgeAnchor(b, zoom)
                const color = frameColor(f)
                return (
                  <div
                    key={f.fid}
                    data-testid="frame-badge"
                    className="absolute flex items-center gap-1 whitespace-nowrap"
                    style={{ left: a.x + 8, top: a.y, transform: a.inside ? 'translate(-100%, 4px)' : 'translate(-100%, -50%)' }}
                  >
                    <span
                      className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
                      style={{ background: color }}
                      title="המקום של המסגרת בסדר הקריאה של העמוד"
                    >
                      {f.order}
                    </span>
                    <span
                      className="rounded-full bg-white/95 px-1.5 text-[11px] font-bold leading-4 shadow-sm"
                      style={{ color, border: `1px ${suggested ? 'dashed' : 'solid'} ${color}` }}
                    >
                      {frameLabel(view, f, seqs?.get(f.fid))}
                      {suggested && <span className="mr-1 font-normal opacity-70">· הצעה</span>}
                    </span>
                  </div>
                )
              })}
            {mode === 'frames' &&
              (furniture || [])
                .filter((m) => isBox(m.bbox))
                .map((m) => (
                  <span
                    key={`f${m.id}`}
                    data-testid="furniture-label"
                    title="ריהוט הדף שהמחשב זיהה — לא נכנס לספר; אין צורך לצייר לו מסגרת"
                    className="absolute rounded-sm bg-neutral-100/90 px-1 text-[10px] leading-4 text-neutral-600"
                    style={{ left: m.bbox[0] * zoom + 2, top: m.bbox[1] * zoom + 1 }}
                  >
                    ריהוט · {streamInfo(view, m.stream).he}
                  </span>
                ))}
            {mode === 'lines' &&
              lines
                .filter((l) => recut.has(l.id) && l.status !== 'removed' && isBox(l.bbox))
                .map((l) => (
                  <span
                    key={l.id}
                    data-testid="recut-label"
                    className="absolute rounded-sm bg-warning-100/90 px-1 text-[10px] leading-4 text-warning-800"
                    style={{ left: l.bbox[0] * zoom + 2, top: l.bbox[1] * zoom + 1 }}
                  >
                    לזיהוי מחדש
                  </span>
                ))}
          </div>

          {overlay && (
            <div
              ref={ovRef}
              data-testid="scan-overlay"
              data-side={ovShown ? ovPos.side : undefined}
              className="absolute z-10"
              style={
                ovKey
                  ? { left: ovPos?.left ?? 0, top: ovPos?.top ?? 0, width: ovWidth ?? undefined, visibility: ovShown ? 'visible' : 'hidden' }
                  : undefined
              }
            >
              {overlay}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

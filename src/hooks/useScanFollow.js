'use client'

// גלילת הצילום אחרי הסמן (תוכנית §5.4): השורה בצילום נעמדת מול השורה של הסמן בטקסט
// (scanFollow.followScroll), והמילה נכנסת לחלון אופקית. במעבר שורה — חלק; באותה שורה —
// מיידי; prefers-reduced-motion — תמיד מיידי. גלגלת/מגע/לחיצה על הצילום משהים את המעקב
// לרגע (USER_QUIET_MS), כדי שהצילום לא "יימשך" מתחת ליד של מי שגולל אותו.
//
// "השורה של הסמן" היא שורת המסך שלו (caretRowY — Range על שכבת ה-mirror), לא ראש השורה
// הלוגית: בטקסט שמגיע כגוש (עמוד/פסקה בשורה אחת, מוצג בגלישה) ראש השורה הלוגית יכול להיות
// מסך שלם מעל הסמן. כשהסמן גלול מחוץ לחלון הטקסט — הצילום מתיישר לטקסט שבאמצע החלון (trackAt).
// שורה שאי אפשר לגלול אל מול הסמן (הטור השני בצילום דו-טורי מתחיל בראש התמונה) — נוסף מרווח
// גלילה מעל/מתחת לתמונה (followSlack).
//
// המדידות בזמן ריצה (getBoundingClientRect של שכבת ה-SVG בתוך העטיפה המוגדלת), כך שהזום
// (CSS zoom), הריפוד והמרכוז של ImagePanel נלקחים בחשבון בלי לשכפל את הפריסה שלו.

import { useCallback, useEffect, useRef } from 'react'
import { followScroll, followSlack, holdScanLine } from '@/lib/editor/scanFollow'
import { caretRowMid, lineColAt, locateCol, rowInView } from '@/lib/editor/caretRow'
import { lineStarts } from '@/lib/editor/caretWord'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { isEditorField, queryAllEditorFields, richFieldApi } from '@/lib/editor/editorField'

export const USER_QUIET_MS = 1200
// גלילת הטקסט נחשבת כנעצרת אחרי זמן כזה בלי אירוע גלילה
export const SCROLL_SETTLE_MS = 160
const EDGE = 24

/**
 * מרכז השורה של הסמן (clientY): משכבת ה-mirror אם יש (מדויק גם בגלישת שורות), ואחרת
 * לפי גובה השורה של ה-textarea (בלי גלישה).
 * @param {HTMLTextAreaElement|null} ta
 * @param {number} line
 */
export function caretLineMidY(ta, line) {
  if (!ta || !Number.isInteger(line)) return null
  const rich = richFieldApi(ta)
  if (rich) return rich.lineMidY(line)
  const host = ta.parentElement
  const el = host?.querySelector?.(`[data-text-mirror] [data-line="${line}"]`)
  if (el) {
    const r = el.getBoundingClientRect()
    if (r.height > 0) return r.top + Math.min(r.height, lineHeightOf(ta)) / 2
  }
  const r = ta.getBoundingClientRect()
  const cs = window.getComputedStyle(ta)
  const lh = lineHeightOf(ta)
  return r.top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0) + line * lh - ta.scrollTop + lh / 2
}

const mirrorOf = (ta) => ta?.parentElement?.querySelector?.('[data-text-mirror]') || null

// צומתי הטקסט של שורה ב-mirror, בלי מספר השורה שבשוליים
function textNodesOf(el) {
  const out = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('[data-line-number]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n)
  return out
}

function charRect(node, a, b) {
  if (!node || a < 0 || b > node.length || a >= b) return null
  const r = document.createRange()
  r.setStart(node, a)
  r.setEnd(node, b)
  return [...(r.getClientRects?.() || [])].find((x) => x.height > 0) || null
}

/**
 * מרכז שורת המסך של הסמן (clientY) בהיסט pos — לפי התו שאחריו בשכבת ה-mirror (שבירת השורות
 * זהה ל-textarea). null כשאין mirror או שהשורה לא נמצאה.
 * @param {HTMLTextAreaElement|null} ta
 * @param {number} pos
 */
export function caretRowY(ta, pos) {
  // השדה המעוצב מודד בעצמו (השורות שלו הן התצוגה עצמה)
  const rich = richFieldApi(ta)
  if (rich) return Number.isFinite(pos) ? rich.caretRowY(pos) : null
  const m = mirrorOf(ta)
  if (!m || !Number.isFinite(pos)) return null
  const { line, col } = lineColAt(ta.value, pos)
  const el = m.querySelector(`[data-line="${line}"]`)
  if (!el) return null
  const nodes = textNodesOf(el)
  const at = locateCol(nodes.map((n) => n.length), col)
  if (!at) return null
  const n = nodes[at.index]
  return caretRowMid(charRect(n, at.offset, at.offset + 1), charRect(n, at.offset - 1, at.offset))
}

/**
 * ההיסט בטקסט (תחילת צומת הטקסט — מילה או הרווח שלפניה) שבשורת המסך בגובה y (clientY).
 * null כשאין mirror או שאף שורה לא בגובה הזה.
 * @param {HTMLTextAreaElement|null} ta
 * @param {number} y
 */
export function caretOffsetAtY(ta, y) {
  const rich = richFieldApi(ta)
  if (rich) return Number.isFinite(y) ? rich.offsetAtY(y) : null
  const m = mirrorOf(ta)
  if (!m || !Number.isFinite(y)) return null
  const lines = m.querySelectorAll('[data-line]')
  // השורות בסדר אנכי — חיפוש בינארי
  let lo = 0
  let hi = lines.length - 1
  let el = null
  while (lo <= hi && !el) {
    const mid = (lo + hi) >> 1
    const r = lines[mid].getBoundingClientRect()
    if (y < r.top) hi = mid - 1
    else if (y > r.bottom) lo = mid + 1
    else el = lines[mid]
  }
  if (!el) return null
  const start = lineStarts(ta.value)[Number(el.getAttribute('data-line'))] ?? 0
  // צומת הטקסט הקרוב ביותר אנכית (y יכול ליפול ברווח שבין השורות — גובה התו קטן מגובה השורה)
  let acc = 0
  let best = start
  let bestD = Infinity
  for (const n of textNodesOf(el)) {
    const r = document.createRange()
    r.selectNodeContents(n)
    for (const x of r.getClientRects?.() || []) {
      if (!(x.height > 0)) continue
      const d = y < x.top ? x.top - y : y > x.bottom ? y - x.bottom : 0
      if (d < bestD) [best, bestD] = [start + acc, d]
    }
    if (bestD === 0) break
    acc += n.length
  }
  return best
}

/**
 * היעד בצילום לגלילה, בקואורדינטות התוכן של אזור הגלילה: lineMidPx (עם zoom ו-contentOffset —
 * הפרמטרים של followScroll) והטווח האופקי במסך (x0..x1), לפי המלבן של שכבת ה-SVG.
 * @param {Element} svg
 * @param {HTMLElement} el אזור הגלילה
 * @param {DOMRect} er המלבן שלו
 * @param {{ lineBox: number[], wordBox?: number[]|null }} t
 * @param {[number, number]} k מקואורדינטות המקור לפיקסלי התמונה
 * @param {number} z
 */
export function scanTarget(svg, el, er, t, k, z) {
  const box = t.wordBox || t.lineBox
  const sr = svg.getBoundingClientRect()
  return {
    lineMidPx: ((t.lineBox[1] + t.lineBox[3]) / 2) * k[1],
    zoom: z,
    contentOffset: sr.top - er.top + el.scrollTop,
    x0: sr.left + box[0] * k[0] * z,
    x1: sr.left + box[2] * k[0] * z,
  }
}

function lineHeightOf(ta) {
  const cs = window.getComputedStyle(ta)
  const lh = parseFloat(cs.lineHeight)
  if (Number.isFinite(lh) && lh > 0) return lh
  return (parseFloat(cs.fontSize) || 16) * 1.6
}

/**
 * @param {{ scrollRef: { current: HTMLElement|null }, track: import('@/lib/editor/caretTrack').CaretTrack|null,
 *   lineChanged?: boolean, zoom: number, scale?: [number, number], getTextarea: () => HTMLTextAreaElement|null,
 *   textContainerRef?: { current: HTMLElement|null }, enabled?: boolean,
 *   trackAt?: ((pos: number) => import('@/lib/editor/caretTrack').CaretTrack|null)|null }} p
 *   scale — מקואורדינטות המקור לפיקסלי התמונה (רוחב/גובה התמונה ÷ size המקור)
 *   trackAt — המעקב להיסט כלשהו בטקסט (לטקסט שבאמצע החלון כשהסמן גלול מחוץ לו)
 */
export function useScanFollow({ scrollRef, track, lineChanged = false, zoom, scale = [1, 1], getTextarea, textContainerRef, enabled = true, trackAt = null }) {
  const userAt = useRef(0)
  const pointerDown = useRef(false)
  // מרווח הגלילה שנוסף לצילום (followSlack) — מוסר כשהמעקב נכבה / ביציאה
  const slack = useRef({ el: null, top: 0, bottom: 0, baseTop: 0, baseBottom: 0 })
  useEffect(() => {
    if (!enabled) return undefined
    const sl = slack.current
    return () => {
      if (sl.el) {
        sl.el.style.paddingTop = ''
        sl.el.style.paddingBottom = ''
      }
      Object.assign(sl, { el: null, top: 0, bottom: 0 })
    }
  }, [enabled, scrollRef])
  const latest = useRef({ track, zoom, scale, getTextarea, trackAt })
  // השורה בצילום (וה-zoom) שאליה יושרה הגלילה בפעם האחרונה — כל עוד נשארים בה, לא גוללים אנכית
  const aligned = useRef({ line: '', zoom: 0 })
  useEffect(() => {
    latest.current = { track, zoom, scale, getTextarea, trackAt }
  })

  // פעולת משתמש על הצילום
  useEffect(() => {
    const el = scrollRef?.current
    if (!el || !enabled) return undefined
    const mark = () => {
      userAt.current = Date.now()
    }
    const down = () => {
      pointerDown.current = true
      mark()
    }
    const up = () => {
      if (!pointerDown.current) return
      pointerDown.current = false
      mark()
    }
    el.addEventListener('wheel', mark, { passive: true })
    el.addEventListener('touchstart', mark, { passive: true })
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('wheel', mark)
      el.removeEventListener('touchstart', mark)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [scrollRef, enabled])

  // force — ליישר גם כשנשארים באותה שורה בצילום (גלילת הטקסט / שינוי רוחב מזיזים את הסמן במסך)
  const follow = useCallback((smooth, force = false) => {
    const el = scrollRef?.current
    const { track: caretTrack, zoom: z, scale: k, getTextarea: getTa, trackAt: at } = latest.current
    let t = caretTrack
    if (!el || !t?.lineBox || !(el.clientHeight > 0)) return
    if (pointerDown.current || Date.now() - userAt.current < USER_QUIET_MS) return
    const svg = el.querySelector('[data-scan-overlay]')
    if (!svg) return
    const er = el.getBoundingClientRect()
    const ta = getTa?.() || null
    let caretY = ta ? caretRowY(ta, ta.selectionStart ?? 0) : null
    if (caretY == null) caretY = caretLineMidY(ta, t.line)
    if (ta && at) {
      // הסמן גלול מחוץ לחלון הטקסט — מיישרים לטקסט שבאמצע החלון
      const tr = ta.getBoundingClientRect()
      if (!rowInView(caretY, tr.top, tr.bottom, 4)) {
        const midY = (tr.top + tr.bottom) / 2
        const off = caretOffsetAtY(ta, midY)
        const t2 = off == null ? null : at(off)
        if (t2?.lineBox) {
          t = { ...t2, wordBox: null }
          caretY = caretRowY(ta, off) ?? midY
        }
      }
    }
    const args = {
      ...scanTarget(svg, el, er, t, k, z),
      caretMidInViewport: Number.isFinite(caretY) ? caretY - er.top : NaN,
      viewportH: el.clientHeight,
      contentH: el.scrollHeight,
      edge: EDGE,
    }
    // שורה שאי אפשר לגלול אל מול הסמן (ראש/תחתית התמונה, למשל הטור השני בצילום דו-טורי) —
    // מוסיפים מרווח גלילה מעל/מתחת לתמונה (רק גדל, עד שהמעקב נכבה), ומודדים מחדש
    const need = followSlack(args)
    const sl = slack.current
    if (need.top > sl.top + 1 || need.bottom > sl.bottom + 1) {
      if (!sl.el) {
        const cs = window.getComputedStyle(el)
        Object.assign(sl, { el, baseTop: parseFloat(cs.paddingTop) || 0, baseBottom: parseFloat(cs.paddingBottom) || 0 })
      }
      const addTop = Math.max(0, need.top - sl.top)
      sl.top = Math.max(sl.top, need.top)
      sl.bottom = Math.max(sl.bottom, need.bottom)
      el.style.setProperty('padding-top', `${sl.baseTop + sl.top}px`)
      el.style.setProperty('padding-bottom', `${sl.baseBottom + sl.bottom}px`)
      // התוכן זז מטה ב-addTop — שומרים על מה שעל המסך עד הגלילה עצמה
      if (addTop) el.scrollBy?.({ top: addTop, behavior: 'auto' })
      Object.assign(args, scanTarget(svg, el, er, t, k, z))
      args.contentH = el.scrollHeight
    }
    // הסמן ירד שורה בטקסט אבל בצילום זו אותה שורה, והיא נראית בנוחות — הצילום נשאר במקומו
    const lineId = t.scanIndex != null ? `s${t.scanIndex}` : `t${t.line}`
    const sameLine = !force && aligned.current.line === lineId && aligned.current.zoom === z
    const hold = holdScanLine({
      sameLine,
      lineMidInViewport: args.lineMidPx * z + args.contentOffset - el.scrollTop,
      viewportH: el.clientHeight,
    })
    aligned.current = { line: lineId, zoom: z }
    const top = hold ? el.scrollTop : followScroll(args)
    // אופקית — רק אם המילה (או השורה) מחוץ לחלון; בהפרש, כך שגם גלילת RTL שלילית עובדת
    const { x0, x1 } = args
    let dx = 0
    if (x1 - x0 <= er.width - 2 * EDGE) {
      if (x0 < er.left + EDGE) dx = x0 - (er.left + EDGE)
      else if (x1 > er.right - EDGE) dx = x1 - (er.right - EDGE)
    }
    const dy = top == null ? 0 : top - el.scrollTop
    if (Math.abs(dy) < 2 && Math.abs(dx) < 2) return
    const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto'
    el.scrollTo?.({ top: el.scrollTop + dy, left: el.scrollLeft + dx, behavior })
  }, [scrollRef])

  const key = track ? `${track.scanIndex}|${track.line}|${track.wordBox?.join(',') ?? ''}` : ''
  useEffect(() => {
    if (!enabled || !key) return
    follow(lineChanged)
  }, [enabled, key, lineChanged, zoom, follow])

  // גלילת הטקסט מזיזה את שורת הסמן על המסך — הצילום מתיישר כשהגלילה נעצרת. הקלדה (מילה שגולשת לשורת
  // המסך הבאה) ושינוי רוחב/גופן (שבירת שורות אחרת) מזיזים את שורת הסמן גם כשהמעקב לא השתנה —
  // מיישרים אחרי שני פריימים (אחרי שהמעקב ושכבת ה-mirror התעדכנו).
  useEffect(() => {
    const root = textContainerRef?.current
    if (!root || !enabled) return undefined
    let raf = 0
    let raf2 = 0
    let force = false
    const later = (forceAlign = false) => {
      force = force || forceAlign
      if (raf || raf2) return
      raf = requestAnimationFrame(() => {
        raf = 0
        raf2 = requestAnimationFrame(() => {
          raf2 = 0
          const f = force
          force = false
          follow(false, f)
        })
      })
    }
    // גלילת הטקסט מזיזה את הסמן במסך — מיישרים גם באותה שורה בצילום, אבל רק כשהגלילה נעצרת
    // (SCROLL_SETTLE_MS בלי אירוע גלילה), בתנועה חלקה. יישור בכל פריים בזמן גלילה רציפה (שתי
    // אצבעות במשטח מגע) גרם לצילום לרצד: שורת האמצע מתחלפת בקפיצות והצילום קפץ אחריה.
    let settle = 0
    const onScroll = (e) => {
      if (!isEditorField(e.target)) return
      clearTimeout(settle)
      settle = setTimeout(() => {
        settle = 0
        follow(true, true)
      }, SCROLL_SETTLE_MS)
    }
    const onInput = (e) => {
      if (isEditorField(e.target)) later()
    }
    root.addEventListener('scroll', onScroll, true)
    root.addEventListener('input', onInput, true)
    // שינוי רוחב/גופן — שבירת שורות אחרת, מיישרים מחדש; הקלדה שגולשת לשורת מסך — רק אם השורה בצילום השתנתה
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => later(true))
    queryAllEditorFields(root).forEach((ta) => ro?.observe(ta))
    return () => {
      root.removeEventListener('scroll', onScroll, true)
      root.removeEventListener('input', onInput, true)
      ro?.disconnect()
      clearTimeout(settle)
      if (raf) cancelAnimationFrame(raf)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [textContainerRef, enabled, follow])

  const pause = useCallback(() => {
    userAt.current = Date.now()
  }, [])
  return { follow, pause }
}

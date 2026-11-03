'use client'

// הסמן ב-textarea → שורה ומילה בצילום (תוכנית §5.4): selectionchange / keyup / click /
// input → requestAnimationFrame → caretTrack.trackCaret. ה-textarea עצמו לא משתנה (הקלדה,
// ביטול ו-IME כרגיל) — מאזינים בלבד. בכיוון ההפוך: caretFromScan(שורה, מילה, נקודה) מציב את
// הסמן בתחילת המילה שהמעקב מסמן בנקודה שנלחצה, מתמקד בשדה וגולל אותו כך ששורת הסמן נעמדת
// מול השורה שנלחצה בצילום (revealCaret) — בשתי התצוגות, גם כשהשדה גלול למקום אחר לגמרי.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWordAlignCache, lineAlignmentFor, offsetFromScan, trackCaret } from '@/lib/editor/caretTrack'
import { queryEditorField, richFieldApi } from '@/lib/editor/editorField'
import { revealScrollTop } from '@/lib/editor/caretRow'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { caretRowY } from '@/hooks/useScanFollow'

/**
 * ה-textarea של הטור: בעמוד בטור אחד — ה-textarea בלי data-column; בשני טורים — לפי הצד.
 * (או השדה המעוצב שבמקומו — editorField.js; ממשק תואם-textarea)
 * @param {HTMLElement|null} root
 * @param {'content'|'right'|'left'|null} column
 * @returns {HTMLTextAreaElement|null}
 */
export function findTextarea(root, column) {
  if (!root?.querySelector) return null
  return /** @type {HTMLTextAreaElement|null} */ (queryEditorField(root, column === 'right' || column === 'left' ? column : null))
}

const EMPTY = Object.freeze([])

/**
 * גלילת השדה כך ששורת המסך של ההיסט pos נעמדת בגובה targetY (clientY — השורה שנלחצה בצילום),
 * ואם הוא מחוץ לחלון השדה / לא ידוע — באמצע החלון. textarea: המדידה על שכבת ה-mirror (בגלישת
 * שורות — שורת המסך, לא ראש השורה הלוגית), ביחס לגלילה של השכבה עצמה (היא מסתנכרנת לשדה רק
 * באירוע הגלילה); השדה המעוצב — Range על התצוגה עצמה. חלק; קפיצה רחוקה / בלי תנועה — מיידי.
 * @param {HTMLElement|null} field
 * @param {number} pos
 * @param {{ targetY?: number|null, smooth?: boolean }} [opts]
 * @returns {boolean} האם נקבעה גלילה
 */
export function revealCaret(field, pos, { targetY = null, smooth = true } = {}) {
  if (!field || !Number.isFinite(pos)) return false
  const rowY = caretRowY(/** @type {any} */ (field), pos)
  const layer = richFieldApi(field) ? field : field.parentElement?.querySelector?.('[data-text-mirror]') || field
  const r = field.getBoundingClientRect()
  const viewTop = r.top + (field.clientTop || 0)
  const top = revealScrollTop({
    rowY,
    targetY,
    viewTop,
    viewBottom: viewTop + (field.clientHeight || r.height),
    measuredScroll: layer.scrollTop || 0,
    maxScroll: field.scrollHeight - field.clientHeight,
    margin: 16
  })
  if (top == null) return false
  if (Math.abs(top - field.scrollTop) < 2) return true
  // קפיצה רחוקה (יותר משני מסכים) — מיידית: גלילה חלקה של אלפי פיקסלים איטית, וממשיכה אחרי
  // שהשהיית המעקב של הצילום נגמרה (והצילום היה "נמשך" אחרי הטקסט שבדרך)
  const far = Math.abs(top - field.scrollTop) > 2 * (field.clientHeight || r.height)
  const behavior = smooth && !far && !prefersReducedMotion() ? 'smooth' : 'auto'
  if (typeof field.scrollTo === 'function') field.scrollTo({ top, behavior })
  else field.scrollTop = top
  return true
}

const sameBox = (a, b) => a === b || (!!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.01))
const sameTrack = (a, b) =>
  !!a && !!b && a.line === b.line && a.word === b.word && a.scanIndex === b.scanIndex && a.kind === b.kind &&
  a.lineCount === b.lineCount && a.lineWords === b.lineWords && a.lineEstimated === b.lineEstimated &&
  sameBox(a.lineBox, b.lineBox) && sameBox(a.wordBox, b.wordBox)

/**
 * @param {{ containerRef: { current: HTMLElement|null }, column?: 'content'|'right'|'left'|null,
 *   scanLines?: import('@/lib/editor/trackingSource').TrackLine[], wordLevel?: boolean, enabled?: boolean }} p
 * @returns {{ track: import('@/lib/editor/caretTrack').CaretTrack|null, lineChanged: boolean,
 *   caretFromScan: (scanIndex: number, scanWord?: number|null, point?: { x: number, y?: number, clientY?: number|null }|null) => boolean, getTextarea: () => HTMLTextAreaElement|null,
 *   trackAt: (pos: number) => import('@/lib/editor/caretTrack').CaretTrack|null }}
 */
export function useWordTracking({ containerRef, column = 'content', scanLines = EMPTY, wordLevel = true, enabled = true }) {
  const [state, setState] = useState({ track: null, lineChanged: false })
  const cache = useMemo(() => createWordAlignCache(), [])
  const alignRef = useRef({ text: null, lines: null, al: null })
  const rafRef = useRef(0)
  const lines = scanLines || EMPTY

  const getTextarea = useCallback(() => findTextarea(containerRef?.current || null, column), [containerRef, column])

  const alignmentFor = useCallback((text) => {
    const a = alignRef.current
    if (a.text === text && a.lines === lines) return a.al
    const al = lineAlignmentFor(text, lines)
    alignRef.current = { text, lines, al }
    return al
  }, [lines])

  const compute = useCallback(() => {
    rafRef.current = 0
    const ta = getTextarea()
    if (!ta) return
    const text = ta.value
    const t = trackCaret(text, ta.selectionStart ?? 0, lines, { alignment: alignmentFor(text), wordLevel, cache })
    setState((s) => (sameTrack(s.track, t) ? s : { track: t, lineChanged: !s.track || s.track.line !== t.line || s.track.scanIndex !== t.scanIndex }))
  }, [getTextarea, lines, wordLevel, cache, alignmentFor])

  // המעקב להיסט כלשהו (לא הסמן) — לגלילת הצילום אל הטקסט שבחלון כשהסמן גלול מחוץ לו
  const trackAt = useCallback((pos) => {
    const ta = getTextarea()
    if (!ta || !Number.isFinite(pos)) return null
    const text = ta.value
    return trackCaret(text, pos, lines, { alignment: alignmentFor(text), wordLevel, cache })
  }, [getTextarea, lines, wordLevel, cache, alignmentFor])

  const schedule = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(compute)
  }, [compute])

  // מקור/שורות חדשים — היישורים הקודמים לא תקפים
  useEffect(() => {
    cache.clear()
  }, [lines, wordLevel, cache])

  useEffect(() => {
    if (!enabled) return undefined
    const root = containerRef?.current
    if (!root) return undefined
    const onSel = () => {
      const ta = getTextarea()
      if (ta && document.activeElement === ta) schedule()
    }
    const onLocal = (e) => {
      if (e.target === getTextarea()) schedule()
    }
    document.addEventListener('selectionchange', onSel)
    for (const ev of ['keyup', 'click', 'input', 'focusin']) root.addEventListener(ev, onLocal, true)
    schedule()
    return () => {
      document.removeEventListener('selectionchange', onSel)
      for (const ev of ['keyup', 'click', 'input', 'focusin']) root.removeEventListener(ev, onLocal, true)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [enabled, containerRef, getTextarea, schedule])

  const caretFromScan = useCallback((scanIndex, scanWord = null, point = null) => {
    const ta = getTextarea()
    if (!ta) return false
    const text = ta.value
    const off = offsetFromScan(text, lines, alignmentFor(text), scanIndex, scanWord, { x: point?.x ?? null, wordLevel, cache })
    if (off < 0) return false
    ta.setSelectionRange(off, off)
    // בלי הגלילה של הדפדפן (ב-contenteditable היא לא קורית בכלל, ב-textarea — רק לקצה החלון):
    // revealCaret מעמיד את שורת הסמן מול השורה שנלחצה בצילום (point.clientY)
    ta.focus({ preventScroll: true })
    revealCaret(ta, off, { targetY: point?.clientY ?? null })
    schedule()
    return true
  }, [getTextarea, lines, alignmentFor, schedule, wordLevel, cache])

  return { track: enabled ? state.track : null, lineChanged: state.lineChanged, caretFromScan, getTextarea, trackAt }
}

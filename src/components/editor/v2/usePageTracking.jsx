'use client'

// נקודת חיבור אחת של מעקב השורה/המילה לעורך העמוד (תוכנית §6 שלבים 2–3): מקור
// הקואורדינטות (useTrackingSource), הסמן ↔ הצילום (useWordTracking), גלילת הצילום אחרי
// הסמן (useScanFollow), ושכבות הציור — ScanWordOverlay לתוך ImagePanel ו-TextMirror
// דרך TextEditor. הדף מקבל שלושה דברים:
//   imagePanelProps  — לפזר על <ImagePanel> (renderOverlay, scrollRef)
//   textEditorProps  — לפזר על <TextEditor> (mirror, wrap)
//   tracking         — לשורת המצב: { level, source, estimated, downgraded, canImprove, line, word, ... }

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { alignmentAgreement, lineAlignmentFor, linesForColumn } from '@/lib/editor/caretTrack'
import { lineWords, splitLines } from '@/lib/editor/caretWord'
import { suspectWords } from '@/lib/editor/suspectWords'
import { effectiveWrap } from '@/lib/editor/wrapMode'
import { assessAlignment, assessProfile, assessText, combineAssessments, PENDING_ALIGNMENT } from '@/lib/editor/trackingPlausibility'
import { useTrackingSource } from '@/hooks/useTrackingSource'
import { useWordTracking } from '@/hooks/useWordTracking'
import { useScanFollow } from '@/hooks/useScanFollow'
import ScanWordOverlay from './ScanWordOverlay'

function countWords(text) {
  let words = 0
  let suspects = 0
  for (const l of splitLines(text || '')) {
    words += lineWords(l).length
    suspects += suspectWords(l).length
  }
  return { words, suspects }
}

// requestIdleCallback כשיש (דפדפן), אחרת setTimeout
const idle = (fn, timeout) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout })
    return () => window.cancelIdleCallback?.(id)
  }
  const id = setTimeout(fn, 0)
  return () => clearTimeout(id)
}

/**
 * בדיקת העקביות אחרי היישור (assessAlignment) — יקרה (יישור מילים בכל הקבוצות), ולכן בזמן
 * פנוי ולא בכל הקשה: מיד כשהשורות משתנות (מקור חדש), ובהשהיה אחרי הקלדה. החישוב משאיר את
 * היישור ויישורי המילים במטמון — ההקשה הראשונה לא מחשבת אותם מאפס. עד התוצאה הראשונה לשורות
 * האלה — PENDING_ALIGNMENT (פס שורה, בלי מסגרת מילה); אחרי הקלדה — התוצאה הקודמת נשארת.
 * @param {{ enabled: boolean, text: string, lines: any[] }} p
 */
function useAlignmentCheck({ enabled, text, lines }) {
  const [state, setState] = useState({ lines: null, result: null })
  const fresh = state.lines === lines
  useEffect(() => {
    if (!enabled) return undefined
    let cancel = () => {}
    const run = () => {
      cancel = idle(() => {
        const result = assessAlignment(alignmentAgreement(text, lines, lineAlignmentFor(text, lines)))
        setState((s) => (s.lines === lines && s.result?.level === result.level && s.result?.reasons.join() === result.reasons.join() ? s : { lines, result }))
      }, 500)
    }
    const t = setTimeout(run, fresh ? 600 : 0)
    return () => {
      clearTimeout(t)
      cancel()
    }
    // fresh בכוונה לא בתלויות: רק קובע את ההשהיה כשהטקסט/השורות משתנים
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, text, lines])
  if (!enabled) return null
  return fresh ? state.result : PENDING_ALIGNMENT
}

/**
 * @param {{ bookPath?: string, pageNumber?: number, imageUrl?: string|null, twoColumns?: boolean,
 *   activeTextarea?: 'right'|'left'|null, textContainerRef: { current: HTMLElement|null },
 *   imageZoom?: number, text?: string, enabled?: boolean, extraSource?: any, proofDoc?: any,
 *   lineNumbers?: boolean, showSuspects?: boolean, wrap?: 'soft'|'off',
 *   showFrame?: boolean, followScroll?: boolean, highlight?: 'normal'|'strong' }} p
 *   imageZoom — באחוזים, כמו ב-ImagePanel; text — הטקסט של הטור הפעיל (לספירה)
 *   showFrame — false: בלי שכבת המסגרת על הצילום (המעקב עצמו ממשיך לשורת המצב ולטקסט)
 *   followScroll — false: הצילום לא נגלל אחרי הסמן
 *   wrap — 'off' מתבקש ("מול הסריקה") ננקט רק כשהטקסט שורה-מול-שורה (effectiveWrap); גוש → 'soft'
 *   highlight — עוצמת הסימון של המילה והשורה (בצילום ובטקסט); ברירת מחדל 'strong'
 */
export function usePageTracking({
  bookPath,
  pageNumber,
  imageUrl,
  twoColumns = false,
  activeTextarea = null,
  textContainerRef,
  imageZoom = 100,
  text = '',
  enabled = true,
  extraSource = null,
  proofDoc = null,
  lineNumbers = true,
  showSuspects = true,
  wrap,
  showFrame = true,
  followScroll = true,
  highlight = 'strong'
}) {
  const { source, imageSize, status, hasOfficialWordLayout } = useTrackingSource({ bookPath, pageNumber, imageUrl, proofDoc, extraSource, enabled })
  const column = twoColumns ? (activeTextarea === 'left' ? 'left' : 'right') : 'content'
  const { lines, wordLevel } = useMemo(() => linesForColumn(source, { twoColumns, column }), [source, twoColumns, column])
  // שמירה מפני מסגרות בטוחות שגויות (פרופיל מהתמונה בלבד): פריסה לא סבירה / טקסט שלא מתאים
  // לצילום → 'line' (פס בלי מסגרת מילה) או 'off'. בדיקת התמונה — פעם למקור; הטקסט — בכל שינוי.
  // גם זיהוי מקומי (tesseract) נבדק — סדר השורות שלו בעמוד מורכב לא בהכרח סדר הטקסט
  const profiled = source.source === 'profile'
  const guarded = profiled || source.source === 'local'
  const hasText = !!(text || '').trim()
  const imgCheck = useMemo(() => (guarded ? assessProfile(source) : null), [guarded, source])
  const txtCheck = useMemo(() => (guarded && hasText ? assessText(text, lines) : null), [guarded, hasText, text, lines])
  const alnCheck = useAlignmentCheck({ enabled: enabled && guarded && hasText, text, lines })
  const guard = useMemo(() => combineAssessments(source, imgCheck, txtCheck, alnCheck), [source, imgCheck, txtCheck, alnCheck])
  const level = guard.level
  const on = enabled && level !== 'off'
  const { track: rawTrack, lineChanged, caretFromScan, getTextarea, trackAt } = useWordTracking({ containerRef: textContainerRef, column, scanLines: lines, wordLevel: wordLevel && level === 'word', enabled: on })
  // מסגרת מילה מהפרופיל רק ביחידה שבה מספרי המילים בטקסט ובצילום מסכימים (track.confident)
  const track = useMemo(() => (rawTrack && rawTrack.wordBox && profiled && (level !== 'word' || !rawTrack.confident)
    ? { ...rawTrack, wordBox: null, kind: null }
    : rawTrack), [rawTrack, profiled, level])

  const scrollRef = useRef(null)
  const zoom = (Number(imageZoom) || 100) / 100
  const scale = useMemo(() => {
    const s = source.size
    return s && imageSize ? [imageSize[0] / s[0], imageSize[1] / s[1]] : [1, 1]
  }, [source.size, imageSize])
  const { pause: pauseFollow } = useScanFollow({ scrollRef, track, lineChanged, zoom, scale, getTextarea, textContainerRef, trackAt, enabled: on && followScroll })

  // לחיצה על הצילום: הצילום נשאר במקום (בלי גלילת מעקב על התזוזה הזו) והטקסט נגלל כך ששורת
  // הסמן נעמדת מול השורה שנלחצה — גובה המסך של מרכז השורה בצילום (לפי המלבן של השכבה; בלי
  // תיבת שורה — הנקודה שנלחצה)
  const onPick = useCallback((line, word, point) => {
    pauseFollow()
    const svg = scrollRef.current?.querySelector?.('[data-scan-overlay]') || null
    let clientY = null
    if (svg && point) {
      const box = lines[line]?.bbox
      const y = box ? (box[1] + box[3]) / 2 : point.y
      const r = svg.getBoundingClientRect()
      const H = svg.viewBox?.baseVal?.height
      if (r.height > 0 && H > 0 && Number.isFinite(y)) clientY = r.top + (y / H) * r.height
    }
    caretFromScan(line, word, { ...point, clientY })
  }, [caretFromScan, pauseFollow, lines])

  const estimated = !!track && (track.lineEstimated || (track.kind != null && track.kind !== 'solid') || (profiled && !track.confident))
  const renderOverlay = useCallback(({ naturalWidth, naturalHeight, zoom: z }) => (
    <ScanWordOverlay
      width={naturalWidth}
      height={naturalHeight}
      sourceSize={source.size}
      zoom={z}
      lines={lines}
      lineBox={track?.lineBox ?? null}
      wordBox={track?.wordBox ?? null}
      kind={track?.kind ?? null}
      lineNumber={track && track.scanIndex != null ? track.line + 1 : null}
      onPick={onPick}
      strength={highlight}
    />
  ), [source.size, lines, track, onPick, highlight])

  const counts = useMemo(() => countWords(text), [text])

  const tracking = useMemo(() => ({
    level: on ? level : 'off',
    source: on ? source.source : null,
    estimated,
    // הרמה הורדה כי הפריסה שזוהתה מהתמונה לא סבירה (שורת המצב מסבירה ומציעה "זהה מילים בעמוד")
    downgraded: enabled && guard.downgraded,
    reasons: guard.reasons,
    // מעקב שאפשר לשפר בזיהוי מילים מקומי: כבוי / שורה / מילה משוערת מניתוח התמונה
    canImprove: enabled && (level === 'line' || level === 'off' || profiled),
    // מאפשר לדף לבטל את בקשת PageLayout הספקולטיבית: layout רשמי ברמת מילה תמיד עדיף עליה.
    hasOfficialWordLayout,
    status,
    line: track ? track.line + 1 : null,
    word: track && track.word >= 0 ? track.word + 1 : null,
    lineCount: track ? track.lineCount : splitLines(text || '').length,
    scanLineCount: lines.length,
    wordCount: counts.words,
    suspectCount: showSuspects ? counts.suspects : 0
  }), [on, level, source.source, estimated, enabled, guard, profiled, hasOfficialWordLayout, status, track, text, lines.length, counts, showSuspects])

  const mirror = useMemo(() => (enabled
    ? { column, line: on ? track?.line : -1, word: on ? track?.word : -1, estimated, lineNumbers, showSuspects, strength: highlight }
    : undefined), [enabled, on, column, track, estimated, lineNumbers, showSuspects, highlight])

  // טקסט שמגיע כגוש (עמוד/פסקה בשורה אחת) תמיד גולש — גם כשההעדפה "מול הסריקה"
  const wrapMode = useMemo(() => effectiveWrap(wrap, text, lines), [wrap, text, lines])

  return {
    tracking,
    imagePanelProps: on && showFrame ? { renderOverlay, scrollRef } : { scrollRef },
    textEditorProps: { mirror, wrap: wrapMode },
    caretFromScan
  }
}

export default usePageTracking

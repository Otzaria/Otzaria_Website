'use client'

// מקור הקואורדינטות לעמוד (תוכנית §5.1): layout v1 מ-GET /api/page-content/ocr-data,
// מסמך הגהת-עמודים (PageProofPage.doc — רק אם הקורא מעביר אותו: אין GET לפי sitePage
// שאינו תופס את העמוד), מקור חיצוני מוכן (extraSource — למשל תיבות tesseract מקומיות או
// /api/page-layout, כבר במבנה האחיד), ופרופיל ההקרנה מהתמונה (useScanLines) כגיבוי.
//
// בחירה: הראשון בסדר layout → proof → extra שנותן מילים; אחרת הראשון מביניהם שנותן שורות;
// ורק אם אף אחד — הפרופיל. (הפרופיל "נותן מילים" ממרווחים בלבד — לא יעקוף layout עם טקסט.)
// הפרופיל מנותח רק כשאין מקור מילים אחר — אין טעם לשרוף זמן מעבד.

import { useEffect, useMemo, useState } from 'react'
import { OFF, fromLayout, fromProfile, fromProof } from '@/lib/editor/trackingSource'
import { useScanLines } from './useScanLines'

const isSource = (s) => !!s && typeof s === 'object' && typeof s.level === 'string' && Array.isArray(s.lines)

/**
 * המקור הנבחר מתוך מקורות מנורמלים, בסדר העדיפות.
 * @param {import('@/lib/editor/trackingSource').TrackSource[]} primary
 * @param {import('@/lib/editor/trackingSource').TrackSource} fallback
 */
export function choosePrimary(primary, fallback = OFF) {
  const live = primary.filter((s) => isSource(s) && s.level !== 'off')
  return live.find((s) => s.level === 'word') || live[0] || (isSource(fallback) && fallback.level !== 'off' ? fallback : OFF)
}

/**
 * @param {{ bookPath?: string|null, pageNumber?: number|null, imageUrl?: string|null,
 *   proofDoc?: any, extraSource?: import('@/lib/editor/trackingSource').TrackSource|null, enabled?: boolean }} p
 * @returns {{ source: import('@/lib/editor/trackingSource').TrackSource, level: string, lines: any[],
 *   imageSize: [number, number]|null, status: 'idle'|'loading'|'ready' }}
 */
export function useTrackingSource({ bookPath = null, pageNumber = null, imageUrl = null, proofDoc = null, extraSource = null, enabled = true } = {}) {
  const [ocr, setOcr] = useState({ key: null, layout: null, done: false })
  const key = enabled && bookPath && Number.isInteger(pageNumber) ? `${bookPath}\u0000${pageNumber}` : null

  useEffect(() => {
    if (!key) return undefined
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null
    let alive = true
    const url = `/api/page-content/ocr-data?bookPath=${encodeURIComponent(bookPath)}&pageNumber=${pageNumber}`
    fetch(url, { signal: ctrl?.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive) return
        const d = body?.success ? body.data : null
        // matches:false — התמונה הוחלפה אחרי ה-OCR, הקואורדינטות כבר לא שלה
        const ok = d && d.layoutStatus === 'ok' && d.layout && d.image?.matches !== false
        setOcr({ key, layout: ok ? d.layout : null, done: true })
      })
      .catch(() => {
        if (alive) setOcr({ key, layout: null, done: true })
      })
    return () => {
      alive = false
      ctrl?.abort()
    }
  }, [key, bookPath, pageNumber])

  // התשובה של עמוד אחר (לפני שהבקשה החדשה חזרה) — לא שלנו
  const current = ocr.key === key ? ocr : { layout: null, done: !key }
  const layoutSrc = useMemo(() => (current.layout ? fromLayout(current.layout) : OFF), [current.layout])
  const extra = isSource(extraSource) ? extraSource : OFF

  // ממדי התמונה — תמיד (להמרה), הניתוח — רק כשצריך
  const needProfile = enabled && current.done && ![layoutSrc, extra].some((s) => s.level === 'word') && !proofDoc
  const scan = useScanLines(enabled ? imageUrl : null, { analyze: needProfile })
  const proofSrc = useMemo(() => (proofDoc ? fromProof(proofDoc, { imageSize: scan.size }) : OFF), [proofDoc, scan.size])
  const profileSrc = useMemo(() => (scan.profile ? fromProfile(scan.profile) : OFF), [scan.profile])

  const source = useMemo(() => (enabled ? choosePrimary([layoutSrc, proofSrc, extra], profileSrc) : OFF), [enabled, layoutSrc, proofSrc, extra, profileSrc])
  const status = !enabled || !key ? 'idle' : !current.done || (needProfile && scan.status === 'loading') ? 'loading' : 'ready'
  return { source, level: source.level, lines: source.lines, imageSize: scan.size, status, hasOfficialWordLayout: layoutSrc.level === 'word' }
}

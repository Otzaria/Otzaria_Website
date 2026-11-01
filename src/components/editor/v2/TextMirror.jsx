'use client'

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { lineWords, splitLines } from '@/lib/editor/caretWord'
import { suspectWords } from '@/lib/editor/suspectWords'

/** רוחב שולי מספרי השורות (בצד ההתחלה — ימין ב-RTL) */
export const MIRROR_GUTTER_PX = 44

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const glow = (pct) => `color-mix(in srgb, var(--editor-text-glow, var(--color-glow)) ${pct}%, transparent)`

/**
 * עוצמות הסימון בטקסט. "חזק" (ברירת המחדל): רקע ברור ומעוגל מאחורי המילה הנוכחית (box-shadow
 * מרחיב אותו בלי להזיז טקסט) וקו תחתון עבה; פס שורה חזק יותר. "רגיל" — המראה המקורי.
 * multi — הרקע של שורה לוגית שגולשת לכמה שורות מסך (הפס החזק עובר רק לשורת המסך של המילה).
 */
export const MIRROR_HIGHLIGHT = {
  normal: { band: glow(24), multi: glow(10), word: null, underline: '2.5px' },
  strong: { band: glow(32), multi: glow(10), word: glow(70), wordEstimated: glow(50), ring: 'color-mix(in srgb, var(--color-primary) 85%, transparent)', underline: '3px' }
}

function syncScroll(ta, m) {
  if (!ta || !m) return
  if (m.scrollTop !== ta.scrollTop) m.scrollTop = ta.scrollTop
  if (m.scrollLeft !== ta.scrollLeft) m.scrollLeft = ta.scrollLeft
}

// סימון מילה: הנוכחית (קו רציף + רקע לפי העוצמה) או חשודה (קו מנוקד). מיקום משוער — אותו
// סגנון רציף (בלי קווקוו), רק רקע מעט חלש יותר
function wordStyle(cur, sus, estimated, hl) {
  if (cur) {
    const style = { textDecorationLine: 'underline', textDecorationStyle: 'solid', textDecorationColor: 'var(--color-primary)', textDecorationThickness: hl.underline, textUnderlineOffset: '0.3em' }
    if (hl.word) {
      // רקע בלבד (בלי ריפוד/גבול) — לא משנה את מיקום הטקסט ביחס ל-textarea. box-shadow מרחיב
      // את הרקע בריווח נוח ומוסיף סביבו קו דק אחד (1.25px)
      const bg = estimated ? hl.wordEstimated : hl.word
      Object.assign(style, { background: bg, borderRadius: '6px', boxShadow: `0 0 0 4px ${bg}, 0 0 0 5.25px ${hl.ring}`, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' })
    }
    return style
  }
  if (sus) return { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'var(--color-on-warning-container)', textDecorationThickness: '2px', textUnderlineOffset: '0.32em' }
  return undefined
}

/**
 * כמה מילים בכל מקטע ממוזכר של שורה בת n מילים. בכל תזוזה נבנים מחדש כל רכיבי המקטעים של
 * השורה (n/c) ושני המקטעים שהמילה יצאה מהם ונכנסה אליהם (2c) — המינימום ב-c ≈ √(n/2).
 * @param {number} n
 */
export function mirrorChunkSize(n) {
  return Math.max(8, Math.min(40, Math.round(Math.sqrt(Math.max(0, n) / 2))))
}

// מקטע של מילים בשורה (from..to) — ממוזכר, כך שבשורת-גוש של מאות מילים הקשת חץ מייצרת מחדש
// רק את המקטעים שבהם המילה הנוכחית השתנתה (ולא את כל ה-spans של השורה). words — מ-lineWords
// (שמור לפי תוכן, ולכן אותו מערך כל עוד השורה לא השתנתה); word — המילה הנוכחית, או -1 אם אינה במקטע.
const MirrorChunk = memo(function MirrorChunk({ text, words, from, to, word, estimated, suspectKey, strength }) {
  const hl = MIRROR_HIGHLIGHT[strength] || MIRROR_HIGHLIGHT.strong
  const suspects = suspectKey ? new Set(suspectKey.split(',').map(Number)) : null
  // רק מילה מסומנת (נוכחית/חשודה) עוטפת ב-span; כל השאר — מחרוזת אחת רציפה. span לכל מילה שינה
  // את מדידת הרוחב בתת-פיקסל (כל span נמדד ומעוגל לחוד), ובשורה לוגית ארוכה (טקסט שמגיע כגוש)
  // הסטייה המצטברת שברה מילה לשורה הבאה ב-mirror אבל לא ב-textarea — וכל הסימון מתחתיה זז שורה.
  const parts = []
  let plain = ''
  for (let k = from; k < to; k++) {
    const w = words[k]
    const prevEnd = k > 0 ? words[k - 1].end : 0
    if (w.start > prevEnd) plain += text.slice(prevEnd, w.start)
    const isCur = w.i === word
    const isSus = Boolean(suspects?.has(w.i))
    if (!isCur && !isSus) { plain += w.text; continue }
    if (plain) { parts.push(plain); plain = '' }
    parts.push(
      <span key={w.i} data-word={w.i} data-current={isCur ? '' : undefined} data-suspect={isSus ? '' : undefined} style={wordStyle(isCur, isSus, estimated, hl)}>
        {w.text}
      </span>
    )
  }
  if (plain) parts.push(plain)
  return parts
})

function MirrorLine({ text, n, current, word, estimated, suspectKey, numbers, strength }) {
  const hl = MIRROR_HIGHLIGHT[strength] || MIRROR_HIGHLIGHT.strong
  const words = lineWords(text)
  const parts = []
  const chunk = mirrorChunkSize(words.length)
  for (let from = 0; from < words.length; from += chunk) {
    const to = Math.min(words.length, from + chunk)
    const cw = current && word >= from && word < to ? word : -1
    parts.push(<MirrorChunk key={from} text={text} words={words} from={from} to={to} word={cw} estimated={cw >= 0 && Boolean(estimated)} suspectKey={suspectKey} strength={strength} />)
  }
  const last = words.length ? words[words.length - 1].end : 0
  if (last < text.length) parts.push(text.slice(last))
  return (
    <div data-line={n} data-current={current ? '' : undefined} style={{ position: 'relative', background: current ? hl.band : undefined }}>
      {numbers && (
        <span
          aria-hidden="true"
          data-line-number=""
          style={{
            position: 'absolute',
            insetInlineStart: -MIRROR_GUTTER_PX + 6,
            width: MIRROR_GUTTER_PX - 16,
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'var(--font-sans, sans-serif)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            color: current ? 'var(--color-on-primary)' : 'var(--color-outline)',
            background: current ? 'var(--color-primary)' : undefined,
            borderRadius: current ? '999px' : undefined,
            lineHeight: '20px',
            top: 'calc((1lh - 20px) / 2)'
          }}
        >
          {n + 1}
        </span>
      )}
      {parts.length ? parts : '​'}
    </div>
  )
}

/**
 * פס שורת-המסך של המילה הנוכחית, כשהשורה הלוגית הנוכחית גולשת לכמה שורות מסך. מחשב מהמיקום
 * בפועל של המילה (getClientRects) וגובה השורה; אחרת מסתיר את הפס ומחזיר לשורה את הרקע הרגיל.
 */
export function placeRowBand(m, band, strength) {
  if (!m || !band) return
  const hl = MIRROR_HIGHLIGHT[strength] || MIRROR_HIGHLIGHT.strong
  const lineEl = m.querySelector('[data-line][data-current]')
  const wordEl = lineEl?.querySelector('[data-word][data-current]')
  const lh = parseFloat(getComputedStyle(m).lineHeight)
  const lineRect = lineEl?.getBoundingClientRect()
  const rect = wordEl?.getClientRects?.()[0]
  if (!lineEl || !rect || !(lh > 0) || !(lineRect.height > lh * 1.5)) {
    band.style.display = 'none'
    if (lineEl) lineEl.style.background = hl.band
    return
  }
  const mr = m.getBoundingClientRect()
  const mid = (rect.top + rect.bottom) / 2
  band.style.display = 'block'
  band.style.background = hl.band
  band.style.top = `${mid - lh / 2 - mr.top - m.clientTop + m.scrollTop}px`
  band.style.height = `${lh}px`
  band.style.left = `${lineEl.offsetLeft}px`
  band.style.width = `${lineEl.offsetWidth}px`
  lineEl.style.background = hl.multi
}

const Line = memo(MirrorLine, (a, b) =>
  a.strength === b.strength && a.text === b.text && a.n === b.n && a.current === b.current && a.numbers === b.numbers && a.suspectKey === b.suspectKey &&
  (!a.current || (a.word === b.word && a.estimated === b.estimated))
)

/**
 * שכבת mirror שקופה מאחורי textarea (תוכנית §5.4): אותו גופן, ריפוד ושבירת שורות, טקסט
 * שקוף — ומעליו רקע השורה הנוכחית, קו מתחת למילה הנוכחית (מקווקו כשמיקומה בצילום משוער),
 * קו מנוקד מתחת למילים חשודות, ומספרי שורות בשוליים. הגלילה מסונכרנת ל-textarea
 * (textarea — האלמנט עצמו). ה-textarea עצמו נשאר רגיל — הקלדה, ביטול ו-IME לא נפגעים.
 *
 * את הקופסה (מיקום, ריפוד, גבול, גופן) מעביר המארח ב-style/className — אותם ערכים כמו של
 * ה-textarea; כאן רק התוכן והסנכרון.
 *
 * @param {{ text: string, textarea: HTMLTextAreaElement|null, column?: string,
 *   currentLine?: number, currentWord?: number, estimated?: boolean, lineNumbers?: boolean,
 *   showSuspects?: boolean, wrap?: 'soft'|'off', strength?: 'normal'|'strong',
 *   className?: string, style?: object }} props
 *
 * בגלישה (wrap='soft') שורה לוגית אחת יכולה לתפוס כמה שורות מסך (טקסט שמגיע כגוש): אז כל
 * השורה הלוגית מקבלת רקע עדין, והפס החזק — רק שורת המסך שבה המילה הנוכחית (data-row-band).
 */
export default function TextMirror({
  text,
  textarea,
  column = 'content',
  currentLine = -1,
  currentWord = -1,
  estimated = false,
  lineNumbers = false,
  showSuspects = false,
  wrap = 'soft',
  strength = 'strong',
  className,
  style
}) {
  const ref = useRef(null)
  const rowRef = useRef(null)
  const lines = useMemo(() => splitLines(text ?? ''), [text])
  // המילים החשודות בכל שורה כמחרוזת אינדקסים ("1,4") — השוואה לפי ערך ב-memo של השורה
  const suspectKeys = useMemo(
    () => lines.map((l) => (showSuspects ? suspectWords(l).map((x) => x.index).join(',') : '')),
    [lines, showSuspects]
  )

  useEffect(() => {
    if (!textarea) return undefined
    const onScroll = () => syncScroll(textarea, ref.current)
    textarea.addEventListener('scroll', onScroll, { passive: true })
    return () => textarea.removeEventListener('scroll', onScroll)
  }, [textarea])
  // אחרי כל רינדור (הקלדה משנה את גובה התוכן) — יישור הגלילה מחדש
  useIsoLayoutEffect(() => {
    syncScroll(textarea, ref.current)
    placeRowBand(ref.current, rowRef.current, strength)
  })
  // שינוי רוחב משנה את שבירת השורות — מיקום הפס מחדש
  useEffect(() => {
    const m = ref.current
    if (!m || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => placeRowBand(m, rowRef.current, strength))
    ro.observe(m)
    return () => ro.disconnect()
  }, [strength])

  return (
    <div
      ref={ref}
      data-text-mirror={column}
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        color: 'transparent',
        whiteSpace: wrap === 'off' ? 'pre' : 'pre-wrap',
        overflowWrap: wrap === 'off' ? 'normal' : 'break-word',
        wordBreak: 'normal',
        scrollbarGutter: 'stable',
        // הקשר ערימה משלו: פס שורת-המסך (z-index:-1) מעל הרקע ומתחת לרקע המילה
        isolation: 'isolate',
        ...style
      }}
    >
      <div ref={rowRef} data-row-band="" aria-hidden="true" style={{ position: 'absolute', zIndex: -1, display: 'none', pointerEvents: 'none' }} />
      {lines.map((l, i) => (
        <Line
          key={i}
          n={i}
          text={l}
          current={i === currentLine}
          word={currentWord}
          estimated={estimated}
          suspectKey={suspectKeys[i]}
          numbers={lineNumbers}
          strength={strength}
        />
      ))}
      {/* מרווח בתחתית: גלילת ה-textarea יכולה להגיע מעט רחוק יותר (פס גלילה אופקי) */}
      <div aria-hidden="true" style={{ height: 32 }} />
    </div>
  )
}

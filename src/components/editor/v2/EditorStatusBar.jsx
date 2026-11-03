'use client'

import AppIcon from '@/components/ui/AppIcon'
import Kbd from '@/components/ui/Kbd'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import Tooltip from '@/components/ui/Tooltip'
import TrackingStatus from './TrackingStatus'
import { positionText, restCountdownText, suspectCountText, wordCountText } from './editorStatusText'

// רק קיצורים שממומשים; העמוד מעביר את הקיצורים של המשתמש (shortcuts) — זו רק ברירת מחדל
export const DEFAULT_SHORTCUT_HINTS = [
  { keys: ['Ctrl', 'K'], label: 'פקודות' },
  { keys: ['Ctrl', 'S'], label: 'שמירה' }
]

function Sep({ className }) {
  return <span aria-hidden="true" className={cx('size-1 shrink-0 rounded-(--radius-pill) bg-outline-variant', className)} />
}

/**
 * שורת המצב הקבועה בתחתית העורך — מידע שקט שלא צריך לחפש:
 * רמת המעקב (TrackingStatus), שורה/מילה, ספירת מילים, מילים לבדיקה (לחיץ → המילה הבאה),
 * ספירה לאחור להפסקת עיניים, וקיצורי מקלדת (מוסתרים מתחת ל-xl).
 * שורה אחת תמיד (flex-nowrap, --editor-statusbar-height: 30px; במגע 44px): טקסט המעקב נחתך
 * (truncate) לפני שהשורה נשברת; הכפתורים בה בגובה השורה, ומטרת המגע (44px) דרך ::before.
 *
 * המיקום (שורה/מילה) אינו אזור חי — הוא משתנה בכל הקשה, והכרזה עליו הייתה מציפה.
 *
 * @param {{
 *   tracking?: { level: 'word'|'line'|'ruler'|'off', source?: string, estimated?: boolean },
 *   onTrackingClick?: () => void,
 *   trackingNote?: string | null, trackingClickLabel?: string,
 *   position?: { line?: number, totalLines?: number, word?: number, pageWord?: number, totalWords?: number },
 *   wordCount?: number, suspectCount?: number, onSuspectsClick?: () => void,
 *   restRemainingMs?: number | null, shortcuts?: { keys: string[], label: string }[], className?: string
 * }} props
 */
/** ברירת המחדל עד שהמעקב (שלב 2) מחובר */
export const TRACKING_OFF = Object.freeze({ level: 'off' })

export default function EditorStatusBar({
  tracking = TRACKING_OFF,
  onTrackingClick,
  // הודעה קצרה ליד רמת המעקב (התקדמות "זהה מילים בעמוד", או שגיאה) — אזור חי מנומס
  trackingNote = null,
  trackingClickLabel,
  position,
  wordCount,
  suspectCount = 0,
  onSuspectsClick,
  restRemainingMs = null,
  shortcuts = DEFAULT_SHORTCUT_HINTS,
  className
}) {
  const pos = positionText(position)
  const rest = restCountdownText(restRemainingMs)

  return (
    <footer
      aria-label="שורת מצב"
      className={cx('flex min-h-(--editor-statusbar-height) flex-nowrap items-center gap-x-4 overflow-x-clip border-t border-outline-subtle bg-surface-container-low px-4 text-body-sm text-on-surface-variant', className)}
    >
      <TrackingStatus {...tracking} onClick={onTrackingClick} clickLabel={trackingClickLabel} compact className="min-w-0 shrink" />
      <span role="status" className={cx('min-w-0 shrink truncate tabular-nums', !trackingNote && 'sr-only')}>{trackingNote || ''}</span>

      {pos && (<><Sep /><span className="shrink-0 whitespace-nowrap tabular-nums">{pos}</span></>)}
      {/* ספירת המילים כבר מופיעה ב"מילה X מתוך Y" כשהיא זהה — לא לכפול (בשני טורים היא שונה ונשארת) */}
      {wordCount != null && wordCount !== position?.totalWords && (<><Sep /><span className="shrink-0 whitespace-nowrap tabular-nums max-sm:hidden">{wordCountText(wordCount)}</span></>)}

      {suspectCount > 0 && (
        <>
          <Sep />
          {onSuspectsClick ? (
            <Tooltip content="מעבר למילה הבאה לבדיקה" compact className="shrink-0">
              <button
                type="button"
                onClick={onSuspectsClick}
                aria-label={`${suspectCountText(suspectCount)}. מעבר למילה הבאה`}
                className={cx('inline-flex min-h-(--editor-statusbar-height) items-center gap-1 rounded-(--radius-pill) px-2 text-primary hover:bg-surface-selected', TOUCH_TARGET_OVERLAY, FOCUS_RING)}
              >
                <AppIcon name="spellcheck" className="text-lg" />
                <span className="whitespace-nowrap tabular-nums">{suspectCountText(suspectCount)}</span>
              </button>
            </Tooltip>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
              <AppIcon name="spellcheck" className="text-lg" />
              {suspectCountText(suspectCount)}
            </span>
          )}
        </>
      )}

      <span className="flex-1" />

      {rest && (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
          <AppIcon name="visibility" className="text-lg" />
          {rest}
        </span>
      )}

      {shortcuts.length > 0 && (
        <>
          {rest && <Sep className="max-xl:hidden" />}
          <ul aria-label="קיצורי מקלדת" className="hidden shrink-0 items-center gap-3 xl:flex">
            {shortcuts.map((s) => (
              <li key={s.keys.join('+')} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Kbd keys={s.keys} />
                {s.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </footer>
  )
}

'use client'

import { useId, useState } from 'react'
import Badge from '@/components/ui/Badge'
import FullPageModal from './FullPageModal'
import { MAX_TEXT, boxStyle, contextParts, optionText } from './fastLogic'
import { QUESTION_GUIDE, QUESTION_HINT, guideHref } from './labels'

// כרטיס החלטת נוסח אחת (FastItem) — משותף למסלול המהיר, לתרגול ולשלב "נוסח" בבדיקת עמוד.
// מבנה כמו PagenumTaskCard (LayoutTaskCards): חיתוך מוגדל מהסריקה עם מסגרת סביב המקום, משפט ההקשר
// שבו המקום מודגש, וכפתורי הבחירה. value = {choice, text} או null; onChange(value).
// המקשים (1–4, Enter, N, O, U) — בדף שמחזיק את הכרטיס (fastLogic.keyAction); כאן רק textRef לשדה "משהו אחר".
// compact — לרשימה בבדיקת עמוד: תמונה קטנה יותר, בלי מספרי המקשים.

function Choice({ active, onClick, disabled, keyHint, children, tone = 'primary' }) {
  const on = tone === 'neutral' ? 'bg-neutral-700 text-white border-neutral-700' : 'bg-primary text-on-primary border-primary'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-start text-base font-bold transition-colors disabled:opacity-40 ${
        active ? on : 'border-outline-variant bg-surface text-on-surface hover:border-primary'
      }`}
    >
      {keyHint && (
        <kbd aria-hidden="true" className={`rounded border px-1.5 text-xs font-bold ${active ? 'border-white/60' : 'border-outline-variant text-on-surface/60'}`}>
          {keyHint}
        </kbd>
      )}
      <span className="font-frank">{children}</span>
    </button>
  )
}

export default function FastItemCard({
  item,
  value = null,
  onChange,
  onFlag = null,
  disabled = false,
  compact = false,
  textRef = null,
  showKeys = true,
  result = null,
}) {
  const [showFull, setShowFull] = useState(false)
  const otherId = useId()
  if (!item) return null
  const frame = boxStyle(item.box)
  const ctx = contextParts(item, value)
  const otherText = value?.choice === 'other' ? value.text || '' : ''
  const hint = QUESTION_HINT[item.question]
  const keys = showKeys && !compact

  return (
    <div className="flex flex-col gap-3" data-testid="fast-item" data-item={item.id}>
      <div className="flex flex-wrap items-center gap-2">
        {item.kindLabel && <Badge tone="primary">{item.kindLabel}</Badge>}
        {(item.masechet || item.daf) && (
          <span className="text-sm text-on-surface/60">
            {item.masechet} {item.daf}
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold text-on-surface">{item.prompt || 'מה כתוב בדפוס?'}</h3>
      {hint && (
        <p className="flex items-start gap-1 text-sm text-on-surface/70">
          <span aria-hidden="true" className="material-symbols-outlined text-base text-info-600">tips_and_updates</span>
          <span>
            {hint}{' '}
            <a href={guideHref(QUESTION_GUIDE[item.question])} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
              עוד בהנחיות
            </a>
          </span>
        </p>
      )}

      {item.imageUrl && (
        <div className="rounded-lg border border-neutral-200 bg-white p-2">
          <div className="relative mx-auto w-fit max-w-full">
            <img
              src={item.imageUrl}
              alt="הקטע מהסריקה של הדפוס"
              className={`block h-auto max-w-full ${compact ? 'max-h-28' : 'max-h-64'}`}
              draggable={false}
            />
            {frame && (
              <div
                aria-hidden="true"
                data-testid="crop-frame"
                className="pointer-events-none absolute rounded-sm border-2 border-danger-600 shadow-[0_0_0_9999px_rgba(0,0,0,0.12)]"
                style={frame}
              />
            )}
          </div>
          {item.fullImageUrl && (
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={() => setShowFull(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-primary hover:bg-surface-variant/60">
                <span aria-hidden="true" className="material-symbols-outlined text-base">pageview</span>
                הצג את כל העמוד
              </button>
            </div>
          )}
        </div>
      )}

      {(ctx.before.length > 0 || ctx.after.length > 0 || ctx.middle.length > 0) && (
        <p className="font-frank text-xl leading-loose text-on-surface" data-testid="context">
          <span className="text-on-surface/60">{ctx.before.join(' ')}</span>{' '}
          {ctx.middle.length ? (
            <mark className="rounded bg-warning-100 px-1 font-bold text-on-surface ring-1 ring-warning-400" data-mode={ctx.mode}>
              {ctx.middle.join(' ')}
            </mark>
          ) : (
            <mark className="rounded bg-warning-100 px-2 text-on-surface/50 ring-1 ring-warning-400" data-mode="gap">
              ?
            </mark>
          )}{' '}
          <span className="text-on-surface/60">{ctx.after.join(' ')}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="מה כתוב בדפוס">
        {(item.options || []).map((o, i) => (
          <Choice
            key={o.id}
            active={value?.choice === o.id}
            disabled={disabled}
            keyHint={keys && i < 9 ? String(i + 1) : null}
            onClick={() => onChange?.({ choice: o.id })}
          >
            {optionText(o)}
          </Choice>
        ))}
      </div>

      {item.allowText && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={otherId} className="text-sm font-medium text-on-surface/80">
            משהו אחר{keys ? ' (O)' : ''}:
          </label>
          <input
            id={otherId}
            ref={textRef}
            dir="rtl"
            value={otherText}
            maxLength={MAX_TEXT}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value
              onChange?.(v.trim() ? { choice: 'other', text: v } : null)
            }}
            placeholder="מה כתוב בדפוס, בדיוק"
            className="min-h-11 w-64 max-w-full rounded-lg border border-outline-variant bg-white px-3 font-frank text-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Choice active={value?.choice === 'unclear'} disabled={disabled} tone="neutral" keyHint={keys ? 'U' : null} onClick={() => onChange?.({ choice: 'unclear' })}>
          לא ברור מהסריקה
        </Choice>
        {onFlag && (
          <button
            type="button"
            onClick={onFlag}
            disabled={disabled}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm text-on-surface/70 hover:bg-surface-variant/60 disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">flag</span>
            החיתוך לא מראה את המקום
          </button>
        )}
      </div>

      {result && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${result.correct ? 'border-success-300 bg-success-50 text-success-800' : 'border-danger-300 bg-danger-50 text-danger-800'}`}
        >
          <p className="font-bold">{result.correct ? 'נכון' : `לא נכון. התשובה הנכונה: ${result.expectedText}`}</p>
          {result.explain && <p className="mt-1">{result.explain}</p>}
        </div>
      )}

      {showFull && <FullPageModal src={item.fullImageUrl} box={item.fullBox || null} onClose={() => setShowFull(false)} />}
    </div>
  )
}

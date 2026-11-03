'use client'

import { useEffect } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { LINE_SCRIPTS, WORD_SCRIPTS, SCRIPT_LABELS } from '@/lib/trainingProof/vocab'
import { scriptStyle } from '../common/scripts'
import { boxStyle } from '../common/boxStyle'
import Kbd from '../common/Kbd'
import { isMixed, missingWords } from './routerDraft'
import { useInkWords } from './useInkWords'

// כפתור-כתב בצבע הכתב: מלא כשנבחר
function ScriptButton({ script, on, keyHint, onClick }) {
  return (
    <button
      type="button"
      style={scriptStyle(script)}
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-(--tp-c) px-3 py-1 text-label-md font-bold ${
        on ? 'bg-(--tp-c) text-white' : 'text-(--tp-c)'
      }`}
    >
      {SCRIPT_LABELS[script]}
      {keyHint ? <Kbd>{keyHint}</Kbd> : null}
    </button>
  )
}

// מסגרת לכל מילה; שם הכתב **מעל** המסגרת ולא בתוכה (ה-7), כדי שלא יסתיר את האותיות.
// מקווקו = הצעה שעוד לא אושרה; מלא = סומן.
// בלי כתב ובלי הצעה (חלוקה לפי הדיו) — "?" ולא "ניטרלי", כדי שלא ייראה כאילו כבר נקבע
function WordBox({ word, w, h, selected, onClick }) {
  const lab = word.label || word.pred || 'neutral'
  const name = word.label || word.pred ? SCRIPT_LABELS[lab] : '?'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`מילה ${word.k + 1}: ${word.label || word.pred ? name : 'עוד לא סומנה'}${word.label || !word.pred ? '' : ' (הצעה)'}`}
      style={{ ...boxStyle(word.box, w, h), ...scriptStyle(lab) }}
      className={`absolute rounded-sm border-2 border-(--tp-c) ${word.label ? 'border-solid' : 'border-dashed'} ${
        selected ? 'z-[2] shadow-[0_0_0_3px_var(--color-warning-400)]' : ''
      }`}
    >
      <span className="absolute bottom-[calc(100%+3px)] left-1/2 -translate-x-1/2 rounded bg-(--tp-c) px-1.5 text-[10.5px] leading-[1.35] font-bold whitespace-nowrap text-white">
        {word.label ? '✓ ' : ''}
        {name}
      </span>
    </button>
  )
}

// שורה אחת בנתב: התמונה, כתב-השורה, ובשורה מעורבת — מסגרת וכתב לכל מילה.
export default function RouterLineCard({
  item,
  draft,
  index,
  total,
  current,
  focus,
  wsel,
  saving,
  onSelect,
  onLine,
  onBad,
  onAccept,
  onWord,
  onPickWord,
  onFocus,
  onInkWords,
  onShowCtx,
}) {
  const mixed = isMixed(draft, item)
  const needInk = mixed && !draft.words?.length
  const ink = useInkWords(item.img, needInk)
  useEffect(() => {
    if (needInk && ink) onInkWords(ink)
  }, [needInk, ink, onInkWords])

  const saved = item.status === 'submitted' ? item.result : null
  const wordsFocus = current && mixed && focus === 'words'
  const lineScript = draft.bad ? null : draft.label || null
  const missing = mixed ? missingWords(draft) : 0
  const edge = saved ? (saved.bad ? 'border-s-error' : 'border-s-success') : 'border-s-outline-variant'

  return (
    <article
      id={`tp-line-${item.id}`}
      tabIndex={-1}
      aria-current={current ? 'true' : undefined}
      onClick={(e) => {
        if (!e.target.closest('button')) onSelect()
      }}
      className={`scroll-mt-32 rounded-2xl border border-outline-variant border-s-[5px] bg-(--card-bg) px-4 py-3 shadow-sm ${edge} ${
        current ? 'outline-2 outline-primary' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-on-surface-variant">
        <span>
          שורה {index + 1} מתוך {total}
        </span>
        {saving ? (
          <span>שומר…</span>
        ) : saved?.bad ? (
          <span className="rounded-md bg-error-container px-2 text-on-error-container">נפסלה — לא תיכנס לאימון</span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-success">
            <AppIcon name="check_circle" className="text-base" />
            נשמר: {SCRIPT_LABELS[saved.label]}
            {saved.label === 'mixed' ? ` · ${saved.words?.length || 0} מילים` : ''} · ממתין לאישור
          </span>
        ) : (
          <>
            <span className="rounded-md bg-surface-container-highest px-2">ממתינה</span>
            {item.pred ? (
              <span>
                הצעת הנתב: <b>{SCRIPT_LABELS[item.pred]}</b>
              </span>
            ) : (
              <span>אין הצעה מהנתב</span>
            )}
          </>
        )}
        {mixed && missing && !draft.bad ? <span className="text-warning">עוד לא נשמר — חסר כתב ל-{missing} מילים</span> : null}
        {item.ctx ? (
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={onShowCtx}>
            הצג בעמוד המלא
          </button>
        ) : null}
      </div>

      <div className={`relative my-2 inline-block max-w-full rounded border border-outline-variant bg-white leading-none ${mixed ? 'mt-8' : 'overflow-hidden'}`}>
        <img src={item.img} alt={`תמונת שורה ${index + 1}`} className="block h-auto max-w-full" style={{ maxWidth: Math.min(item.w || 900, 900) }} draggable={false} />
        {mixed && draft.words?.length
          ? draft.words.map((wd, k) => (
              <WordBox key={wd.k} word={wd} w={item.w} h={item.h} selected={wordsFocus && k === wsel} onClick={() => onPickWord(k)} />
            ))
          : null}
        {needInk && !ink ? <span className="absolute inset-x-0 -top-6 text-label-sm text-on-surface-variant">מחלק למילים לפי הדיו…</span> : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <b className="text-label-md">השורה:</b>
        {LINE_SCRIPTS.map((s, d) => (
          <ScriptButton key={s} script={s} on={lineScript === s} keyHint={current && !wordsFocus ? String(d + 1) : null} onClick={() => onLine(s)} />
        ))}
        <Button size="sm" variant="tonal" onClick={onAccept} disabled={!item.pred && !mixed}>
          {mixed ? 'כל המילים נכונות' : 'ההצעה נכונה'} <Kbd>Enter</Kbd>
        </Button>
        <Button size="sm" variant={draft.bad ? 'danger' : 'text'} onClick={onBad}>
          פסול <Kbd>0</Kbd>
        </Button>
        {mixed ? (
          <span className="inline-flex overflow-hidden rounded-full border border-outline text-label-md" role="group" aria-label="על מה המקשים חלים">
            <button type="button" onClick={() => onFocus('line')} className={`px-3 py-1 ${!wordsFocus ? 'bg-secondary-container text-on-secondary-container' : ''}`}>
              המקשים: השורה
            </button>
            <button type="button" onClick={() => onFocus('words')} className={`px-3 py-1 ${wordsFocus ? 'bg-secondary-container text-on-secondary-container' : ''}`}>
              המקשים: המילים
            </button>
          </span>
        ) : null}
      </div>

      {mixed && draft.words?.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <b className="text-label-md">
            המילה המסומנת ({(current ? wsel : 0) + 1}/{draft.words.length}):
          </b>
          {WORD_SCRIPTS.map((s, d) => (
            <ScriptButton
              key={s}
              script={s}
              on={current && draft.words[wsel]?.label === s}
              keyHint={wordsFocus ? String(d + 1) : null}
              onClick={() => onWord(s)}
            />
          ))}
          <span className="text-label-sm text-on-surface-variant">לחיצה על מסגרת בוחרת מילה</span>
        </div>
      ) : null}
    </article>
  )
}

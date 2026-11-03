'use client'

import { useImperativeHandle, useMemo, useState } from 'react'
import { LINE_SCRIPTS, SCRIPT_LABELS } from '@/lib/trainingProof/vocab'
import { ago } from '../api'
import { BTN, ScriptTag, Tag } from '../bits'
import { LineImage, ContextButton } from './LineImage'
import WordBoxes, { nextScript } from './WordBoxes'

// שורה אחת בסקירת הנתב. אפשר לתקן לפני האישור (ה-11): כתב-השורה בכפתורים, ובשורה
// מעורבת — לחיצה על מסגרת-מילה מחליפה את הכתב שלה, ושם הכתב מופיע מעל המסגרת (ה-7).
// תיקון ← "אשר עם התיקון" (נשמר כ-adminFixed); בלי תיקון ← "אשר".

// המצב שמוצג: מה שהמתנדב סימן. מילים — מהסימון, ואם אין (המתנדב לא סימן "מעורבת") —
// מהצעת התחנה, כדי שאפשר יהיה להפוך את השורה למעורבת
function initial(item) {
  const r = item.result || {}
  const words = Array.isArray(r.words) && r.words.length
    ? r.words.map((w) => ({ k: w.k, box: w.box, label: w.label }))
    : Array.isArray(item.words) && item.words.length
      ? item.words.map((w) => ({ k: w.k, box: w.box, label: w.pred || 'square' }))
      : null
  return { label: r.bad ? 'bad' : r.label, words }
}

export function markOf(state) {
  if (state.label === 'bad') return { bad: true }
  if (state.label !== 'mixed') return { label: state.label }
  return { label: 'mixed', words: state.words.map((w) => ({ k: w.k, box: w.box, label: w.label })) }
}

const sameState = (a, b) =>
  a.label === b.label && (a.label !== 'mixed' || (a.words || []).every((w, i) => w.label === b.words?.[i]?.label))

export default function RouterRow({ item, selected, onToggle, onApprove, onReject, onFix, onUnapprove, busy, current = false, onPick, handle }) {
  const start = useMemo(() => initial(item), [item])
  const [st, setSt] = useState(start)
  const changed = !sameState(st, start)
  const volLabel = start.label
  const pending = item.status === 'submitted'
  const canMixed = !!st.words?.length

  const setLabel = (label) => setSt((s) => ({ ...s, label }))
  const cycle = (k) => setSt((s) => ({ ...s, words: s.words.map((w) => (w.k === k ? { ...w, label: nextScript(w.label) } : w)) }))
  // הכפתור הראשי: "אשר", או "אשר עם התיקון" כשמשהו שונה
  const confirm = () => (changed ? onFix(item, markOf(st)) : onApprove(item))

  // המקלדת בסקירה: 1–4 כתב-השורה (תיקון) · 0 פסול · Enter הכפתור הראשי
  useImperativeHandle(handle, () => ({
    setLabel: (label) => pending && !busy && (label !== 'mixed' || canMixed) && setLabel(label),
    confirm: () => pending && !busy && confirm(),
  }))

  return (
    <div
      className={`grid scroll-mt-32 grid-cols-[auto_1fr] gap-3 border-b border-surface-variant p-3 sm:grid-cols-[auto_1fr_auto] ${selected ? 'bg-info-100/40' : ''} ${current ? 'shadow-[inset_4px_0_0_var(--color-primary)] ring-2 ring-inset ring-primary/40' : ''}`}
      data-item={item.id}
      aria-current={current ? 'true' : undefined}
      onClick={(e) => !e.target.closest('button, input, a, [data-word]') && onPick?.()}
    >
      <input type="checkbox" aria-label="סמן שורה" checked={selected} onChange={() => onToggle(item.id)} className="mt-1 h-4 w-4" />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-on-surface/60">{item.vol?.name || '—'} · {ago(item.submittedAt)} · {item.alias} {item.page != null ? `עמ' ${item.page}` : ''}</span>
          <span>
            הנתב הציע: {item.pred ? <ScriptTag script={item.pred} /> : <span className="text-on-surface/60">אין הצעה</span>}
            {item.predP != null && <span className="text-on-surface/50"> ({Math.round(item.predP * 100)}%)</span>}
          </span>
          <span>
            המתנדב: {volLabel === 'bad' ? <Tag tone="err">פסול</Tag> : <ScriptTag script={volLabel} />}
          </span>
          {item.agrees ? <Tag tone="ok">הסכים עם הנתב</Tag> : item.pred && <Tag tone="warn">שונה מההצעה</Tag>}
          {item.adminFixed && <Tag tone="info">תיקנת</Tag>}
          {changed && <Tag tone="info">תיקון שלך — עוד לא נשמר</Tag>}
          {item.status === 'approved' && <Tag tone="ok">אושר</Tag>}
          <ContextButton ctx={item.ctx} alias={item.alias} page={item.page} />
        </div>
        {st.label === 'mixed' && canMixed ? (
          <WordBoxes src={item.img} w={item.w} h={item.h} words={st.words} onCycle={pending ? cycle : null} />
        ) : (
          <LineImage src={item.img} w={item.w} h={item.h} />
        )}
        {item.text && (
          <div dir="rtl" className="text-sm text-on-surface/70">
            {item.text}
          </div>
        )}
        {pending && (
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <b className="text-xs">תיקון:</b>
            {LINE_SCRIPTS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={st.label === s}
                disabled={s === 'mixed' && !canMixed}
                title={s === 'mixed' && !canMixed ? 'לשורה הזו אין חלוקה למילים — אפשר לסמן "מעורבת" רק במסך המתנדב, שמחלק לפי הדיו' : undefined}
                onClick={() => setLabel(s)}
                className={`${BTN.outline} ${st.label === s ? 'border-primary bg-primary text-on-primary hover:bg-primary' : ''}`}
              >
                {SCRIPT_LABELS[s]}
              </button>
            ))}
            <button type="button" aria-pressed={st.label === 'bad'} onClick={() => setLabel('bad')} className={`${BTN.outline} ${st.label === 'bad' ? 'border-danger-500 bg-danger-100' : ''}`}>
              פסול
            </button>
            {st.label === 'mixed' && canMixed && <span className="text-xs text-on-surface/60">לחיצה על מסגרת-מילה מחליפה את הכתב שלה</span>}
            {changed && (
              <button type="button" className={BTN.quiet} onClick={() => setSt(start)}>
                בטל את התיקון
              </button>
            )}
          </div>
        )}
      </div>
      <div className="col-span-2 flex flex-wrap items-start gap-1 sm:col-span-1 sm:flex-col">
        {pending ? (
          <>
            <button className={BTN.primary} disabled={busy} onClick={confirm}>
              <span className="material-symbols-outlined text-sm">check</span> {changed ? 'אשר עם התיקון' : 'אשר'}
            </button>
            <button className={BTN.danger} disabled={busy} onClick={() => onReject(item)}>
              דחה
            </button>
          </>
        ) : (
          <button className={BTN.outline} onClick={() => onUnapprove(item)} disabled={busy}>
            <span className="material-symbols-outlined text-sm">undo</span> החזר לממתינות
          </button>
        )}
      </div>
    </div>
  )
}

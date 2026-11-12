'use client'

import { useImperativeHandle, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import { cx } from '@/components/ui/cx'
import { LINE_SCRIPTS, SCRIPT_LABELS } from '@/lib/trainingProof/vocab'
import { ago } from '../api'
import { ScriptTag, Tag } from '../bits'
import { LineImage, ImageMissing, ContextButton } from './LineImage'
import WordBoxes, { nextScript } from './WordBoxes'
import { REJECT, ROW_ACTIONS, ROW_LABEL, ROW_META, rowClasses } from './reviewStyles'

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
  // תמונה שלא נטענה — אין אישור עיוור ("אשר" מושבת; "דחה" נשאר)
  const [imgFailed, setImgFailed] = useState(false)
  const missingId = `img-missing-${item.id}`
  const noMixedId = `no-mixed-${item.id}`

  const setLabel = (label) => setSt((s) => ({ ...s, label }))
  const cycle = (k) => setSt((s) => ({ ...s, words: s.words.map((w) => (w.k === k ? { ...w, label: nextScript(w.label) } : w)) }))
  // הכפתור הראשי: "אשר", או "אשר עם התיקון" כשמשהו שונה
  const confirm = () => (changed ? onFix(item, markOf(st)) : onApprove(item))

  // המקלדת בסקירה: 1–4 כתב-השורה (תיקון) · 0 פסול · Enter הכפתור הראשי
  useImperativeHandle(handle, () => ({
    setLabel: (label) => pending && !busy && (label !== 'mixed' || canMixed) && setLabel(label),
    confirm: () => pending && !busy && !imgFailed && confirm(),
  }))

  return (
    <li
      className={rowClasses({ selected, current })}
      data-item={item.id}
      aria-current={current ? 'true' : undefined}
      onClick={(e) => !e.target.closest('button, input, a, label, [data-word]') && onPick?.()}
    >
      {/* תיבת סימון רק לשורה שממתינה (בשורה שאושרה אין פעולה על המסומנות) */}
      <div className="-m-2 self-start">
        {pending && (
          <Checkbox label="סמן שורה" checked={selected} onChange={() => onToggle(item.id)} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className={ROW_META}>
          <span>{item.vol?.name || '—'} · {ago(item.submittedAt)} · {item.alias} {item.page != null ? `עמ' ${item.page}` : ''}</span>
          <span className="inline-flex items-center gap-1">
            הנתב הציע: {item.pred ? <ScriptTag script={item.pred} /> : <span>אין הצעה</span>}
            {item.predP != null && <span className="tabular-nums">({Math.round(item.predP * 100)}%)</span>}
          </span>
          <span className="inline-flex items-center gap-1">
            המתנדב: {volLabel === 'bad' ? <Tag tone="err">פסול</Tag> : <ScriptTag script={volLabel} />}
          </span>
          {item.agrees ? <Tag tone="ok">הסכים עם הנתב</Tag> : item.pred && <Tag tone="warn">שונה מההצעה</Tag>}
          {item.adminFixed && <Tag tone="info">תיקנת</Tag>}
          {item.status === 'approved' && <Tag tone="ok">אושר</Tag>}
          <ContextButton ctx={item.ctx} alias={item.alias} page={item.page} />
        </div>
        {imgFailed ? (
          <ImageMissing id={missingId} canApprove={pending} />
        ) : st.label === 'mixed' && canMixed ? (
          <WordBoxes src={item.img} w={item.w} h={item.h} words={st.words} onCycle={pending ? cycle : null} onError={() => setImgFailed(true)} />
        ) : (
          <LineImage src={item.img} w={item.w} h={item.h} onError={() => setImgFailed(true)} />
        )}
        {item.text && (
          <div dir="rtl" className="text-body-md text-on-surface-variant">
            {item.text}
          </div>
        )}
        {pending && (
          <div role="group" aria-label="תיקון הכתב" className="flex flex-wrap items-center gap-1">
            <span className={`${ROW_LABEL} me-1`}>תיקון:</span>
            {LINE_SCRIPTS.map((s) => (
              <Button
                key={s}
                variant="text"
                size="sm"
                aria-pressed={st.label === s}
                softDisabled={s === 'mixed' && !canMixed}
                aria-describedby={s === 'mixed' && !canMixed ? noMixedId : undefined}
                onClick={() => setLabel(s)}
              >
                {SCRIPT_LABELS[s]}
              </Button>
            ))}
            <Button variant="text" size="sm" aria-pressed={st.label === 'bad'} onClick={() => setLabel('bad')}>
              פסול
            </Button>
            {/* מקום שמור: התג והביטול תמיד תופסים את מקומם (שקופים כשאין תיקון) — השורה לא זזה */}
            <span aria-hidden={!changed || undefined} inert={!changed} className={cx('inline-flex flex-wrap items-center gap-1', !changed && 'invisible')}>
              <Tag tone="info">תיקון שלך — עוד לא נשמר</Tag>
              <Button variant="text" size="sm" icon="undo" onClick={() => setSt(start)}>
                בטל את התיקון
              </Button>
            </span>
          </div>
        )}
        {pending && !canMixed && (
          <span id={noMixedId} className="text-body-sm text-on-surface-variant">
            אפשר לסמן &quot;מעורבת&quot; רק כשהשורה מחולקת למילים (בסימון של המתנדב).
          </span>
        )}
        {pending && st.label === 'mixed' && canMixed && <span className="text-body-sm text-on-surface-variant">לחיצה על מסגרת-מילה מחליפה את הכתב שלה</span>}
      </div>
      <div className={ROW_ACTIONS}>
        {pending ? (
          <>
            <Button variant="tonal" size="sm" icon="check" softDisabled={busy || imgFailed} aria-describedby={imgFailed ? missingId : undefined} onClick={confirm}>
              {/* שתי התוויות באותו תא — הכפתור ברוחב הארוכה, ולא מתרחב כשמתקנים */}
              <span className="grid">
                <span aria-hidden={changed || undefined} className={cx('col-start-1 row-start-1', changed && 'invisible')}>אשר</span>
                <span aria-hidden={!changed || undefined} className={cx('col-start-1 row-start-1', !changed && 'invisible')}>אשר עם התיקון</span>
              </span>
            </Button>
            <Button variant="text" size="sm" icon="block" softDisabled={busy} onClick={() => onReject(item)} className={REJECT}>
              דחה
            </Button>
          </>
        ) : (
          <Button variant="text" size="sm" icon="undo" onClick={() => onUnapprove(item)} softDisabled={busy}>
            החזר לממתינות
          </Button>
        )}
      </div>
    </li>
  )
}

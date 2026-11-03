'use client'

import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { OCR_ACTION_LABELS } from '@/lib/trainingProof/vocab'
import { wordDiff } from '../wordDiff'
import { ago } from '../api'
import { BTN, ScriptTag, Tag } from '../bits'
import { LineImage, ContextButton } from './LineImage'

// שורה אחת בסקירת זיהוי-הטקסט: התמונה, מה שהמודל קרא מול מה שהמתנדב שמר (הבדלים
// מסומנים ברמת מילה), ואישור · "תקן ואשר" (עריכה במקום — ה-11) · דחייה.
// "לא קריא" / "לנתב" — המנהל קובע אחרת ממה שהמתנדב סימן (נרשם כתיקון שלו, כמו "תקן ואשר").
// במצב "אושרו": "החזר לממתינות" (לפני ההורדה בלבד).

export const ACTION_TONE = { ok: 'ok', fixed: 'info', seg: 'err', bad: 'err', router: 'warn' }
const ACTION_TEXT = { ...OCR_ACTION_LABELS, ok: 'סימן: נכון', fixed: 'תיקן', router: 'הכתב שגוי ← לנתב' }

// הסימונים שהמנהל קובע בסקירה במקום המתנדב, והמקש של כל אחד (כמו אצל המתנדב: 4 לא קריא · 5 הכתב שגוי)
export const ADMIN_MARKS = [
  { action: 'bad', key: '4', label: 'לא קריא', icon: 'visibility_off' },
  { action: 'router', key: '5', label: 'לנתב', icon: 'alt_route', title: 'הכתב שגוי — השורה חוזרת בתחנה לנתב הכתב' },
]

const dirOf = (track) => (track === 'latin' ? 'ltr' : 'rtl')

function Diff({ from, to, dir }) {
  return (
    <span dir={dir} className="leading-7">
      {wordDiff(from, to).map((d, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {d.op === 'same' ? d.t : d.op === 'del' ? <del className="rounded bg-danger-100 px-0.5 text-danger-700">{d.t}</del> : <ins className="rounded bg-success-100 px-0.5 text-success-800 no-underline">{d.t}</ins>}
        </span>
      ))}
    </span>
  )
}

export default function OcrRow({ item, selected, onToggle, onApprove, onReject, onFix, onMark, onUnapprove, busy, current = false, onPick, handle }) {
  const r = item.result || {}
  const action = r.action
  const volText = action === 'fixed' ? r.text : action === 'ok' ? item.text : ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef(null)
  const dir = dirOf(item.track)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const startEdit = () => {
    setDraft(volText || item.text)
    setEditing(true)
  }
  const save = () => {
    const t = draft.trim()
    if (!t) return
    setEditing(false)
    onFix(item, t)
  }

  const pending = item.status === 'submitted'
  // המקש 2 בסקירה — "תקן ואשר" (עריכה במקום)
  // מה שהמנהל יכול לקבוע במקום המתנדב — בלי מה שהמתנדב כבר סימן (זה אישור רגיל)
  const marks = ADMIN_MARKS.filter((m) => m.action !== action)
  const mark = (a) => pending && !busy && a !== action && onMark?.(item, a)
  // המקשים בסקירה: 2 — "תקן ואשר" (עריכה במקום) · 4 לא קריא · 5 לנתב
  useImperativeHandle(handle, () => ({ edit: () => pending && !busy && startEdit(), mark }))
  return (
    <div
      className={`grid scroll-mt-32 grid-cols-[auto_1fr] gap-3 border-b border-surface-variant p-3 sm:grid-cols-[auto_1fr_auto] ${selected ? 'bg-info-100/40' : ''} ${current ? 'shadow-[inset_4px_0_0_var(--color-primary)] ring-2 ring-inset ring-primary/40' : ''}`}
      data-item={item.id}
      aria-current={current ? 'true' : undefined}
      onClick={(e) => !e.target.closest('button, input, a') && onPick?.()}
    >
      <input type="checkbox" aria-label="סמן שורה" checked={selected} onChange={() => onToggle(item.id)} className="mt-1 h-4 w-4" disabled={!pending && !onUnapprove} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <ScriptTag script={item.track} />
          {item.source === 'synth' && <Tag tone="muted">סינתטית</Tag>}
          {action && <Tag tone={ACTION_TONE[action]}>{ACTION_TEXT[action] || action}</Tag>}
          {item.adminFixed && <Tag tone="info">תיקנת</Tag>}
          {item.status === 'approved' && <Tag tone="ok">אושר</Tag>}
          {item.rejectedCount > 0 && <Tag tone="warn" title="הגשה קודמת של השורה הזו נדחתה">נדחתה {item.rejectedCount}×</Tag>}
          <span className="text-on-surface/60">
            {item.vol?.name || '—'} · {ago(item.submittedAt)} · {item.alias} {item.page != null ? `עמ' ${item.page}` : ''}
            {item.conf != null && ` · ביטחון ${Math.round(item.conf)}`}
          </span>
          <ContextButton ctx={item.ctx} alias={item.alias} page={item.page} />
        </div>
        <LineImage src={item.img} w={item.w} h={item.h} />
        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-base">
          <span className="text-xs text-on-surface/60">המודל:</span>
          <span dir={dir}>{item.text}</span>
          {volText && action === 'fixed' && (
            <>
              <span className="text-xs text-on-surface/60">המתנדב:</span>
              <Diff from={item.text} to={volText} dir={dir} />
            </>
          )}
          {item.adminFixed && item.volResult?.action && (
            <>
              <span className="text-xs text-on-surface/60">המתנדב שלח:</span>
              <span dir={dir} className="text-on-surface/60">
                {item.volResult.action === 'fixed' ? item.volResult.text : ACTION_TEXT[item.volResult.action]}
              </span>
            </>
          )}
          {editing && (
            <>
              <label htmlFor={`fix-${item.id}`} className="text-xs text-on-surface/60">
                התיקון שלך:
              </label>
              <input
                id={`fix-${item.id}`}
                ref={ref}
                dir={dir}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    save()
                  }
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="w-full rounded-md border-2 border-primary bg-surface px-2 py-1 text-base"
              />
            </>
          )}
        </div>
        {editing && <span className="text-xs text-on-surface/60">Enter — אשר עם התיקון · Esc — ביטול</span>}
      </div>
      <div className="col-span-2 flex flex-wrap items-start gap-1 sm:col-span-1 sm:flex-col">
        {pending ? (
          editing ? (
            <>
              <button className={BTN.primary} onClick={save} disabled={busy || !draft.trim()}>
                <span className="material-symbols-outlined text-sm">check</span> אשר עם התיקון
              </button>
              <button className={BTN.quiet} onClick={() => setEditing(false)}>
                ביטול
              </button>
            </>
          ) : (
            <>
              <button className={BTN.primary} onClick={() => onApprove(item)} disabled={busy}>
                <span className="material-symbols-outlined text-sm">check</span> אשר
              </button>
              <button className={BTN.outline} onClick={startEdit} disabled={busy}>
                <span className="material-symbols-outlined text-sm">edit</span> תקן ואשר
              </button>
              {onMark &&
                marks.map((m) => (
                  <button key={m.action} className={BTN.quiet} onClick={() => mark(m.action)} disabled={busy} title={m.title}>
                    <span className="material-symbols-outlined text-sm">{m.icon}</span> {m.label}
                  </button>
                ))}
              <button className={BTN.danger} onClick={() => onReject(item)} disabled={busy}>
                דחה
              </button>
            </>
          )
        ) : (
          <button className={BTN.outline} onClick={() => onUnapprove(item)} disabled={busy}>
            <span className="material-symbols-outlined text-sm">undo</span> החזר לממתינות
          </button>
        )}
      </div>
    </div>
  )
}

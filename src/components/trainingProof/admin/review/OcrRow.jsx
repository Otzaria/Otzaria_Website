'use client'

import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import { fieldClasses } from '@/components/ui/fieldStyles'
import { OCR_ACTION_LABELS } from '@/lib/trainingProof/vocab'
import { ago } from '../api'
import { ScriptTag, Tag } from '../bits'
import DiffText from '../DiffText'
import { LineImage, ImageMissing, ContextButton } from './LineImage'
import { REJECT, ROW_ACTIONS, ROW_LABEL, ROW_META, rowClasses } from './reviewStyles'

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

export default function OcrRow({ item, selected, onToggle, onApprove, onReject, onFix, onMark, onUnapprove, busy, current = false, onPick, handle }) {
  const r = item.result || {}
  const action = r.action
  const volText = action === 'fixed' ? r.text : action === 'ok' ? item.text : ''
  const [editing, setEditing] = useState(false)
  // תמונה שלא נטענה — אין אישור עיוור: "אשר", "תקן ואשר" והסימונים מושבתים; "דחה" נשאר
  const [imgFailed, setImgFailed] = useState(false)
  const missingId = `img-missing-${item.id}`
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
  // מה שהמנהל יכול לקבוע במקום המתנדב — בלי מה שהמתנדב כבר סימן (זה אישור רגיל)
  const marks = ADMIN_MARKS.filter((m) => m.action !== action)
  const blocked = busy || imgFailed
  const mark = (a) => pending && !blocked && a !== action && onMark?.(item, a)
  // המקשים בסקירה: 1 אשר · 2 — "תקן ואשר" (עריכה במקום) · 4 לא קריא · 5 לנתב
  useImperativeHandle(handle, () => ({
    approve: () => pending && !blocked && onApprove(item),
    edit: () => pending && !blocked && startEdit(),
    mark,
  }))
  const missingProps = imgFailed ? { 'aria-describedby': missingId } : {}
  return (
    <li
      className={rowClasses({ selected, current })}
      data-item={item.id}
      aria-current={current ? 'true' : undefined}
      onClick={(e) => !e.target.closest('button, input, a, label') && onPick?.()}
    >
      {/* תיבת סימון רק לשורה שממתינה (בשורה שאושרה אין פעולה על המסומנות) */}
      <div className="-m-2 self-start">
        {pending && (
          <Checkbox label="סמן שורה" checked={selected} onChange={() => onToggle(item.id)} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className={ROW_META}>
          <ScriptTag script={item.track} />
          {item.source === 'synth' && <Tag tone="muted">סינתטית</Tag>}
          {action && <Tag tone={ACTION_TONE[action]}>{ACTION_TEXT[action] || action}</Tag>}
          {item.adminFixed && <Tag tone="info">תיקנת</Tag>}
          {item.status === 'approved' && <Tag tone="ok">אושר</Tag>}
          {item.rejectedCount > 0 && <Tag tone="warn" title="הגשה קודמת של השורה הזו נדחתה">נדחתה {item.rejectedCount}×</Tag>}
          <span className="min-w-0">
            {item.vol?.name || '—'} · {ago(item.submittedAt)} · {item.alias} {item.page != null ? `עמ' ${item.page}` : ''}
            {item.conf != null && ` · ביטחון ${Math.round(item.conf)}`}
          </span>
          <ContextButton ctx={item.ctx} alias={item.alias} page={item.page} />
        </div>
        {imgFailed ? (
          <ImageMissing id={missingId} canApprove={pending} />
        ) : (
          <LineImage src={item.img} w={item.w} h={item.h} onError={() => setImgFailed(true)} />
        )}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-body-lg text-on-surface">
          <span className={ROW_LABEL}>המודל:</span>
          <span dir={dir}>{item.text}</span>
          {volText && action === 'fixed' && (
            <>
              <span className={ROW_LABEL}>המתנדב:</span>
              <DiffText from={item.text} to={volText} dir={dir} />
            </>
          )}
          {item.adminFixed && item.volResult?.action && (
            <>
              <span className={ROW_LABEL}>המתנדב שלח:</span>
              <span dir={dir} className="text-on-surface-variant">
                {item.volResult.action === 'fixed' ? item.volResult.text : ACTION_TEXT[item.volResult.action]}
              </span>
            </>
          )}
          {editing && (
            <>
              <label htmlFor={`fix-${item.id}`} className={ROW_LABEL}>
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
                className={fieldClasses()}
              />
            </>
          )}
        </div>
        {editing && <span className="text-body-sm text-on-surface-variant">Enter — אשר עם התיקון · Esc — ביטול</span>}
      </div>
      <div className={ROW_ACTIONS}>
        {pending ? (
          editing ? (
            <>
              <Button variant="filled" size="sm" icon="check" onClick={save} disabled={busy || !draft.trim()}>
                אשר עם התיקון
              </Button>
              <Button variant="text" size="sm" onClick={() => setEditing(false)}>
                ביטול
              </Button>
            </>
          ) : (
            <>
              <Button variant="tonal" size="sm" icon="check" onClick={() => onApprove(item)} softDisabled={blocked} {...missingProps}>
                אשר
              </Button>
              <Button variant="text" size="sm" icon="edit" onClick={startEdit} softDisabled={blocked} {...missingProps}>
                תקן ואשר
              </Button>
              {onMark &&
                marks.map((m) => (
                  <Button key={m.action} variant="text" size="sm" icon={m.icon} onClick={() => mark(m.action)} softDisabled={blocked} title={m.title} {...missingProps}>
                    {m.label}
                  </Button>
                ))}
              <Button variant="text" size="sm" icon="block" onClick={() => onReject(item)} softDisabled={busy} className={REJECT}>
                דחה
              </Button>
            </>
          )
        ) : (
          <Button variant="text" size="sm" icon="undo" onClick={() => onUnapprove(item)} softDisabled={busy}>
            החזר לממתינות
          </Button>
        )}
      </div>
    </li>
  )
}

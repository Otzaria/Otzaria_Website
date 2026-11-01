'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import AppIcon from '@/components/ui/AppIcon'
import { FRAME_ROLES } from '@/lib/trainingProof/vocab'
import { ROLE_COLORS, ROLE_LABELS, KEY_OF_ROLE, OBJECT_LABELS, OBJECT_ORDER } from './look'
import { NO_STREAM_ROLES, readingOrder, streamSeq } from './geometry'
import { STREAM_KINDS, IN_STREAM_ROLES } from './streamRoles'

// לוח-הצד של עורך-המסגרות: הזרם (Alt+מספר) — שקובע את הסוג של המסגרת — וזרם חדש, התפקיד (1–9), סוג-האובייקט,
// "ממשיך" (C), סדר-הקריאה (מוקדם/מאוחר יותר, Alt+↑/↓, ובתוך הזרם), רשימת סדר-הקריאה של העמוד, ומחיקה.
// כל לחיצה נשמרת מיד (דרך on* של FramesEditor). readOnly — רק מציג.

export function RoleButton({ role, on, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      style={{ '--c': ROLE_COLORS[role] }}
      className={`flex items-center justify-between gap-1 rounded-control border-[1.5px] border-(--c) px-2 py-1 text-label-md font-bold transition-colors disabled:opacity-60 ${
        on ? 'bg-(--c) text-on-primary' : 'bg-transparent text-(--c) hover:bg-surface-container'
      }`}
    >
      <span className="truncate">{ROLE_LABELS[role]}</span>
      <kbd className="text-label-sm opacity-80">{KEY_OF_ROLE[role]}</kbd>
    </button>
  )
}

function NewStreamForm({ onAdd, onDone }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('commentary')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setErr('צריך שם לזרם')
    setBusy(true)
    setErr('')
    try {
      await onAdd(name.trim(), role)
      onDone()
    } catch (x) {
      setErr(x?.message || 'לא נשמר')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-control bg-surface-container-low p-2">
      <label className="flex flex-col gap-1 text-label-md">
        שם הזרם
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder='למשל: הגהות, פירוש ב'
          className="rounded-control border border-outline bg-surface px-2 py-1 text-body-md text-on-surface"
        />
      </label>
      <div className="flex flex-col gap-1 text-label-md">
        הסוג שלו — כל המסגרות של הזרם יקבלו אותו
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="הסוג של הזרם החדש">
          {STREAM_KINDS.map((r) => (
            <RoleButton key={r} role={r} on={role === r} onClick={() => setRole(r)} />
          ))}
        </div>
      </div>
      {err && <p className="text-label-md text-error">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="filled" loading={busy}>
          הוסף
        </Button>
        <Button type="button" size="sm" variant="text" onClick={onDone}>
          ביטול
        </Button>
      </div>
    </form>
  )
}

const small =
  'rounded-control border border-outline px-2 py-1 text-label-md font-bold text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:hover:bg-transparent'

// סדר-הקריאה של המסגרת הנבחרת — בלי לעבור למצב "סדר הקריאה"
function OrderControls({ frame, frames, streams, readOnly, onMove, onPlace, onStreamMove }) {
  const list = readingOrder(frames)
  const i = list.findIndex((f) => f.fid === frame.fid)
  const n = list.length
  const same = frame.stream ? list.filter((f) => f.stream === frame.stream) : []
  const k = same.findIndex((f) => f.fid === frame.fid)
  const sName = streams.find((s) => s.id === frame.stream)?.name
  return (
    <div className="flex flex-col gap-1.5" data-testid="order-controls">
      <h3 className="text-title-sm font-bold">סדר הקריאה</h3>
      <p className="text-label-md text-on-surface-variant">
        מקום בעמוד: <b className="text-on-surface">{frame.ord ?? 'אין עדיין'}</b> מתוך {n}
      </p>
      {!readOnly && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={small} disabled={i <= 0} onClick={() => onMove(-1)} data-testid="order-earlier">
              מוקדם יותר <kbd className="text-label-sm opacity-80">Alt+↑</kbd>
            </button>
            <button type="button" className={small} disabled={i >= n - 1} onClick={() => onMove(1)} data-testid="order-later">
              מאוחר יותר <kbd className="text-label-sm opacity-80">Alt+↓</kbd>
            </button>
          </div>
          {n > 2 && (
            <label className="flex items-center gap-1.5 text-label-md">
              להעביר למקום
              <select
                value={i + 1}
                onChange={(e) => onPlace(+e.target.value)}
                className="rounded-control border border-outline bg-surface px-1.5 py-0.5 text-body-md"
                data-testid="order-place"
              >
                {list.map((_, j) => (
                  <option key={j} value={j + 1}>
                    {j + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {sName && same.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-label-md text-on-surface-variant">
            בתוך הזרם "{sName}": <b className="text-on-surface">{k + 1}</b> מתוך {same.length}
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={small} disabled={k <= 0} onClick={() => onStreamMove(-1)} data-testid="stream-earlier">
                לפני הקודמת בזרם
              </button>
              <button type="button" className={small} disabled={k >= same.length - 1} onClick={() => onStreamMove(1)} data-testid="stream-later">
                אחרי הבאה בזרם
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// כל מסגרות העמוד לפי סדר-הקריאה. לחיצה על שורה בוחרת את המסגרת
function OrderList({ frames, streams, sel, onSelect }) {
  const list = readingOrder(frames)
  const seq = streamSeq(frames)
  const name = Object.fromEntries(streams.map((s) => [s.id, s.name]))
  if (!list.length) return null
  return (
    <div className="flex flex-col gap-1" data-testid="order-list">
      <h3 className="text-title-sm font-bold">סדר הקריאה בעמוד</h3>
      <ol className="flex flex-col gap-0.5">
        {list.map((f) => {
          const on = f.fid === sel
          const text = f.stream && name[f.stream] ? `${name[f.stream]} ${seq.get(f.fid) ?? ''}` : ROLE_LABELS[f.role]
          const extra = IN_STREAM_ROLES.includes(f.role) && f.stream ? ` · ${ROLE_LABELS[f.role]}` : ''
          return (
            <li key={f.fid}>
              <button
                type="button"
                disabled={!onSelect}
                aria-current={on ? 'true' : undefined}
                onClick={() => onSelect?.(f.fid)}
                style={{ '--c': ROLE_COLORS[f.role] || ROLE_COLORS.body }}
                className={`flex w-full items-center gap-2 rounded-control px-1.5 py-0.5 text-start text-label-md ${
                  on ? 'bg-secondary-container font-bold text-on-secondary-container' : 'hover:bg-surface-container'
                }`}
                data-testid="order-row"
              >
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--c) px-1 text-label-sm font-bold text-on-primary">
                  {f.ord ?? '?'}
                </span>
                <span className="truncate">
                  {text}
                  {extra}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function FramePanel({
  frame,
  frames,
  streams,
  readOnly,
  onPatch,
  onSetRole,
  onDelete,
  onAddStream,
  onSelect,
  onMove,
  onPlace,
  onStreamMove,
}) {
  const [adding, setAdding] = useState(false)
  const orderList = <OrderList frames={frames} streams={streams} sel={frame?.fid ?? null} onSelect={onSelect} />
  if (!frame) {
    const auto = frames.filter((f) => f.src === 'auto').length
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <h3 className="text-title-sm font-bold">המסגרת</h3>
          <p className="text-body-sm text-on-surface-variant">
            {readOnly ? 'בחרו מסגרת בעמוד כדי לראות את הזרם והתפקיד שלה.' : 'בחרו מסגרת בעמוד (או ברשימה כאן) כדי לקבוע לה זרם ומקום בסדר הקריאה.'}
          </p>
          <p className="text-body-sm text-on-surface-variant">
            {frames.length} מסגרות בעמוד{auto ? ` · ${auto} מהן הצעת המודל (מקווקוות)` : ''}.
          </p>
        </div>
        {orderList}
      </div>
    )
  }
  const noStream = NO_STREAM_ROLES.includes(frame.role)
  const cur = streams.find((s) => s.id === frame.stream) || null
  return (
    <div className="flex flex-col gap-3" data-testid="frame-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-title-sm font-bold">מסגרת {frame.ord ?? ''}</h3>
        {frame.src === 'auto' && <span className="text-label-sm text-on-surface-variant">הצעת המודל</span>}
      </div>

      {!noStream && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-title-sm font-bold">הזרם (לאיזה טקסט שייכת)</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {streams.map((s, i) => (
              <button
                key={s.id}
                type="button"
                disabled={readOnly}
                aria-pressed={frame.stream === s.id}
                onClick={() => onPatch({ stream: s.id })}
                className={`flex flex-col items-stretch rounded-control border-[1.5px] border-primary px-2 py-1 text-start text-label-md font-bold disabled:opacity-60 ${
                  frame.stream === s.id ? 'bg-primary text-on-primary' : 'text-primary hover:bg-surface-container'
                }`}
                data-testid="stream-button"
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate">{s.name}</span>
                  {i < 9 && <kbd className="text-label-sm opacity-80">Alt+{i + 1}</kbd>}
                </span>
                <span className="text-label-sm font-normal opacity-80">{ROLE_LABELS[s.role] || 'בלי סוג'}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={readOnly}
              aria-pressed={!frame.stream}
              onClick={() => onPatch({ stream: null })}
              className={`rounded-control border-[1.5px] border-outline px-2 py-1 text-label-md font-bold disabled:opacity-60 ${
                !frame.stream ? 'bg-outline text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              בלי זרם
            </button>
          </div>
          <p className="text-label-md text-on-surface-variant" data-testid="kind-note">
            {cur
              ? IN_STREAM_ROLES.includes(frame.role)
                ? `${ROLE_LABELS[frame.role]} בתוך הזרם "${cur.name}" (${ROLE_LABELS[cur.role] || ''}).`
                : `הסוג "${ROLE_LABELS[frame.role]}" נקבע לפי הזרם. משנים אותו ב"הזרמים של הספר".`
              : 'בלי זרם — הסוג נקבע כאן, בתפקיד.'}
          </p>
          {!readOnly && onAddStream && !adding && (
            <Button size="sm" variant="text" icon="add" className="self-start" onClick={() => setAdding(true)}>
              זרם חדש לספר
            </Button>
          )}
          {adding && (
            <NewStreamForm
              onAdd={async (name, role) => {
                const s = await onAddStream(name, role)
                if (s?.id) onPatch({ stream: s.id })
              }}
              onDone={() => setAdding(false)}
            />
          )}
          <label className="flex items-center gap-2 text-body-sm">
            <input type="checkbox" disabled={readOnly} checked={!!frame.cont} onChange={(e) => onPatch({ cont: e.target.checked })} />
            ממשיך בעמוד הבא <kbd className="rounded border border-outline-variant px-1 text-label-sm">C</kbd>
          </label>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <h3 className="text-title-sm font-bold">תפקיד המסגרת</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {FRAME_ROLES.map((r) => (
            <RoleButton key={r} role={r} on={frame.role === r} disabled={readOnly} onClick={() => onSetRole(r)} />
          ))}
        </div>
        {!readOnly && !noStream && (
          <p className="text-label-sm text-on-surface-variant">פנים, פירוש, הערות… — מעבירים לזרם מהסוג הזה. כותרת וכיתוב — בתוך אותו זרם.</p>
        )}
      </div>

      {frame.role === 'object' && (
        <label className="flex flex-col gap-1 text-label-md">
          סוג האובייקט
          <select
            disabled={readOnly}
            value={frame.obj || 'other'}
            onChange={(e) => onSetRole('object', { obj: e.target.value })}
            className="rounded-control border border-outline bg-surface px-2 py-1 text-body-md"
          >
            {OBJECT_ORDER.map((k) => (
              <option key={k} value={k}>
                {OBJECT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}

      <OrderControls
        frame={frame}
        frames={frames}
        streams={streams}
        readOnly={readOnly}
        onMove={onMove}
        onPlace={onPlace}
        onStreamMove={onStreamMove}
      />
      {orderList}

      {!readOnly && (
        <Button size="sm" variant="danger" icon="delete" className="self-start" onClick={onDelete}>
          מחק מסגרת <kbd className="ms-1 text-label-sm opacity-80">Delete</kbd>
        </Button>
      )}
      {readOnly && (
        <p className="flex items-center gap-1 text-label-md text-on-surface-variant">
          <AppIcon name="lock" className="text-base" /> קריאה בלבד
        </p>
      )}
    </div>
  )
}

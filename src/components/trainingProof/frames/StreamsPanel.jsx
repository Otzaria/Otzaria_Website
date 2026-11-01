'use client'

import { useState } from 'react'
import { ROLE_COLORS, ROLE_LABELS } from './look'
import { RoleButton } from './FramePanel'
import { STREAM_KINDS, kindChanged, streamUsage } from './streamRoles'

// רשימת-הזרמים של הספר, עם הסוג של כל זרם — הסוג קובע את הסוג של כל המסגרות שלו (streamRoles.js).
// "שנה סוג" ← כפתור לכל סוג ← onSetKind(stream, role) (הדף המארח שואל ושומר). זרם שנוסף באתר חוזר לתחנה ב-streams_added,
// וזרם מהתחנה שהסוג שלו שונה — ב-streams_changed (docs/76 §5.3).
// pages = [{frames}] — כל עמודי הספר (לספירה "N מסגרות ב-M עמ'").

export default function StreamsPanel({ streams, pages, readOnly = false, onSetKind }) {
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!streams.length) return null
  const pick = async (s, role) => {
    if (role === s.role) return setOpen(null)
    setBusy(true)
    try {
      if (await onSetKind?.(s, role)) setOpen(null)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface p-3.5 shadow-raised" data-testid="streams-panel">
      <h3 className="text-title-sm font-bold">הזרמים של הספר</h3>
      <p className="text-label-sm text-on-surface-variant">הסוג של זרם קובע את הסוג של כל המסגרות שלו, בכל עמודי הספר.</p>
      <ul className="flex flex-col gap-2">
        {streams.map((s) => {
          const u = streamUsage(pages, s.id)
          const editable = !readOnly && !!onSetKind
          return (
            <li key={s.id} className="flex flex-col gap-1" data-testid="stream-row" data-stream={s.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-label-md font-bold">{s.name}</span>
                <span
                  className="shrink-0 rounded-pill px-2 text-label-sm font-bold text-on-primary"
                  style={{ background: ROLE_COLORS[s.role] || ROLE_COLORS.body }}
                  data-testid="stream-kind"
                >
                  {ROLE_LABELS[s.role] || 'בלי סוג'}
                </span>
              </div>
              <span className="text-label-sm text-on-surface-variant">
                {u.frames ? `${u.frames === 1 ? 'מסגרת אחת' : `${u.frames} מסגרות`} ${u.pages === 1 ? 'בעמוד אחד' : `ב-${u.pages} עמ'`}` : 'אין מסגרות'}
                {s.added ? ' · נוסף באתר' : kindChanged(s) ? ` · מהתחנה, שם: ${ROLE_LABELS[s.stationRole] || s.stationRole} — שונה כאן` : ' · מהתחנה'}
              </span>
              {editable && open !== s.id && (
                <button
                  type="button"
                  className="self-start rounded-control border border-outline px-2 py-0.5 text-label-md font-bold hover:bg-surface-container"
                  onClick={() => setOpen(s.id)}
                  data-testid="stream-kind-edit"
                >
                  שנה סוג
                </button>
              )}
              {editable && open === s.id && (
                <div className="flex flex-col gap-1.5 rounded-control bg-surface-container-low p-2">
                  <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={`הסוג של ${s.name}`}>
                    {STREAM_KINDS.map((r) => (
                      <RoleButton key={r} role={r} on={s.role === r} disabled={busy} onClick={() => pick(s, r)} />
                    ))}
                  </div>
                  <button type="button" className="self-start text-label-md text-primary underline" onClick={() => setOpen(null)}>
                    ביטול
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

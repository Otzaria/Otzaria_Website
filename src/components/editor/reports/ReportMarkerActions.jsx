'use client'

import Button from '@/components/ui/Button'
import { markerActionsFor } from '@/lib/pageReports/markerActions'

const ICONS = { replace: 'check', updateMarker: 'edit_note', restore: 'undo' }

/**
 * כפתורי העזרה בפס של ?report=<id>, לדיווח שהוכרע ושהסימון שלו נמצא בטקסט: "החלף בתיקון" / "השאר בסוגריים
 * בנוסח שהוחלט" (אושר), "החזר את המקור" (נדחה). רק למי שעורך את העמוד — ההחלטה מי מורשה בעורך.
 *
 * @param {{ state: any, onRun: (action: { id: string }) => void }} props
 */
export default function ReportMarkerActions({ state, onRun }) {
  if (state?.phase !== 'found' || !state.hit) return null
  const actions = markerActionsFor(state.report, state.hit, state.hit.markerText)
  return actions.map((a) => (
    <Button key={a.id} variant={a.id === 'updateMarker' ? 'outlined' : 'filled'} size="sm" icon={ICONS[a.id]} onClick={() => onRun(a)}>
      {a.label}
    </Button>
  ))
}

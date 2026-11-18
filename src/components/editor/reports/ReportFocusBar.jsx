'use client'

import Button from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import { decisionText } from '@/lib/pageReports/markerActions'
import { reportFocusNotice, reportMarkerLabel } from './reportFocusLogic'

/**
 * פס קטן בתחתית העורך כשהוא נפתח מתוך מסך הדיווחים (?report=<id>): האם הסימון נמצא וסומן, "סמן שוב" וסגירה.
 * לא חוסם עבודה בעורך. extra — תוכן נוסף בפס (פעולות).
 *
 * @param {{ state: ReturnType<typeof import('./useReportFocus').useReportFocus>['state'],
 *   onRehighlight: () => void, onDismiss: () => void, extra?: import('react').ReactNode }} props
 */
export default function ReportFocusBar({ state, onRehighlight, onDismiss, extra = null }) {
  if (!state) return null
  const notice = reportFocusNotice(state)
  const marker = state.report ? reportMarkerLabel(state.report) : ''
  const top = state.placement === 'top'
  const decision = state.report ? decisionText(state.report) : ''
  return (
    <div data-report-focus-bar data-placement={top ? 'top' : 'bottom'}
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${top ? 'top-28' : 'bottom-16 md:bottom-12'}`}>
      <div className="pointer-events-auto w-full max-w-xl shadow-lg">
        <Notice
          tone={notice.tone}
          title="דיווח על טעות בספר"
          action={(
            <>
              {extra}
              {state.report && state.phase !== 'otherPage' && (
                <Button variant="text" size="sm" icon="my_location" onClick={onRehighlight}>סמן שוב</Button>
              )}
              <Button variant="text" size="sm" icon="close" onClick={onDismiss}>סגור</Button>
            </>
          )}
        >
          <p>{notice.text}</p>
          {marker && <p className="mt-1 [overflow-wrap:anywhere]" dir="rtl"><bdi>{marker}</bdi></p>}
          {decision && <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{decision}</p>}
        </Notice>
      </div>
    </div>
  )
}

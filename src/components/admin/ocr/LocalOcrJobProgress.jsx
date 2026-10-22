'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import AppIcon from '@/components/ui/AppIcon'
import OcrStatusBadge from './OcrStatusBadge'
import OcrProgressBar from './OcrProgressBar'
import WorkerOfflineNotice from './WorkerOfflineNotice'
import ResumePreparationNotice from './ResumePreparationNotice'
import WorkerAttentionNotice from './WorkerAttentionNotice'
import {
  canCancel,
  formatLastSeen,
  isRequeued,
  isWorkerUnavailable,
  progressCounts,
  progressPercent,
  resumeIssue,
} from './ocrJobView'

// הסבר קצר לכל מצב פעיל של עבודת local (מתחת לתג המצב)
const STATUS_HINTS = {
  preparing: 'השרת מכין את קובץ העמודים לעיבוד. בספר גדול זה עשוי להימשך כמה דקות.',
  queued: 'העבודה בתור, וממתינה שהמחשב המקומי יאסוף אותה.',
  running: 'המחשב המקומי מעבד את העמודים.',
  pausing: 'המחשב המקומי עוצר את העיבוד באופן מסודר.',
  paused_runner: 'המחשב המקומי עסוק כרגע במשימת GitHub Runner. העיבוד יימשך מאותה נקודה כשתסתיים.',
  delivery_pending: 'העיבוד במחשב המקומי הסתיים, והתוצאה ממתינה למסירה לשרת.',
  applying: 'השרת קולט את התוצאות לעמודי הספר. בשלב זה כבר לא ניתן לבטל.',
  needs_attention: 'העיבוד נעצר וממתין לטיפול ידני במחשב המעבד.',
}

// queued שדווח מהעובד: העבודה כבר התחילה וחזרה לתור במחשב המקומי (isRequeued ב-ocrJobView.js)
const REQUEUED_HINT = 'העבודה חזרה לתור במחשב המקומי (ניסיון חוזר אחרי תקלה, או החזרה ידנית לתור) ותמשיך מעצמה.'

/**
 * תצוגת עבודת OCR מקומי פעילה: מצב, התקדמות, זמינות המחשב המעבד, הודעת העובד וביטול.
 * הודעת העובד ב-needs_attention — WorkerAttentionNotice (תווית עברית + ההודעה המקורית, כטקסט רגיל בלבד).
 *
 * @param {{
 *   job: any,
 *   worker: any,
 *   onCancel: () => Promise<void>|void,
 *   cancelling?: boolean,
 *   canResume?: boolean,
 *   onResume?: () => Promise<void>|void,
 *   resuming?: boolean,
 *   resumeNote?: string,
 *   now?: Date,
 * }} props
 * canResume — הכנה שנעצרה (canResumePreparation ב-ocrJobView.js): מוצג "המשך הכנה" במקום ההסבר הרגיל.
 */
export default function LocalOcrJobProgress({
  job,
  worker,
  onCancel,
  cancelling = false,
  canResume = false,
  onResume,
  resuming = false,
  resumeNote = '',
  now,
}) {
  const [confirming, setConfirming] = useState(false)
  const { done, total } = progressCounts(job)
  const percent = progressPercent(job)
  const cancellable = canCancel(job)
  const applying = job.status === 'applying' || job.decision === 'apply'
  const hint = isRequeued(job) ? REQUEUED_HINT : STATUS_HINTS[job.status]
  const resume = resumeIssue(job)

  const confirmCancel = async () => {
    setConfirming(false)
    await onCancel()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-on-surface-variant">עיבוד במחשב מקומי</span>
        <OcrStatusBadge status={job.status} />
      </div>

      {canResume && onResume ? (
        <ResumePreparationNotice onResume={onResume} resuming={resuming} note={resumeNote} />
      ) : hint ? (
        <p className="text-sm text-on-surface-variant">{hint}</p>
      ) : null}

      {job.status === 'needs_attention' && <WorkerAttentionNotice message={job.workerMessage} />}

      {resume && (
        <div role="alert" className="flex items-start gap-2 rounded-control bg-error-container p-3 text-sm text-on-error-container">
          <AppIcon name="warning" className="text-base" />
          <div>
            <p className="font-bold">השלמת הקליטה מהקובץ השמור נכשלה</p>
            <p className="mt-1 break-words">
              {resume.label}
              {resume.failedAt ? ` (${resume.failedAt})` : ''}.
              {resume.retryAt ? ` ניסיון אוטומטי נוסף: ${resume.retryAt}.` : ''}
            </p>
            <p className="mt-1">
              אם המחשב המקומי עדיין מחזיק את התוצאה, הוא ישלח אותה שוב והקליטה תושלם.
            </p>
          </div>
        </div>
      )}

      {total > 0 && (
        <OcrProgressBar percent={percent} caption={`${done} מתוך ${total} עמודים`} />
      )}

      {isWorkerUnavailable(job, worker) ? (
        <WorkerOfflineNotice worker={worker} now={now} />
      ) : worker?.availability === 'online' ? (
        <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <AppIcon name="computer" className="text-sm" />
          המחשב המעבד מחובר (נראה לאחרונה: {formatLastSeen(worker.lastSeenAt, now)})
        </p>
      ) : null}

      <p className="text-xs text-on-surface-variant">
        אפשר לסגור את החלון ולחזור מאוחר יותר — העבודה שמורה בשרת.
      </p>

      {confirming ? (
        <div className="space-y-3 rounded-control border border-outline-variant p-3">
          <p className="text-sm text-on-surface">
            לבטל את העבודה? העיבוד במחשב המקומי ייעצר, ותוצאה שתגיע אחר כך לא תיקלט לעמודים.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" icon="stop_circle" onClick={confirmCancel} loading={cancelling}>
              כן, לבטל
            </Button>
            <Button variant="text" size="sm" onClick={() => setConfirming(false)}>
              לא, להמשיך
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outlined"
          fullWidth
          icon="stop_circle"
          onClick={() => setConfirming(true)}
          disabled={!cancellable}
          loading={cancelling}
          title={applying ? 'הקליטה כבר החלה — לא ניתן לבטל' : undefined}
        >
          ביטול העבודה
        </Button>
      )}
    </div>
  )
}

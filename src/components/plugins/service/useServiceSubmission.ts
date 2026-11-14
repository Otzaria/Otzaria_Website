'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  apiErrorMessages,
  buildDraftRequest,
  buildUploadQueue,
  type ManageResponse,
  type SubmissionForm
} from './serviceSubmissionLogic'

export type UploadTaskState = { key: string; label: string; state: 'pending' | 'uploading' | 'done' | 'error' }

export type ManageLoad =
  | { phase: 'idle' | 'loading' }
  | { phase: 'ready'; data: ManageResponse }
  | { phase: 'error'; status: number; message: string }

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function loadErrorMessage(status: number): string {
  if (status === 401) return 'יש להתחבר כדי לנהל את הגשות השירות'
  if (status === 403) return 'אין לך הרשאה לנהל את הגשות השירות של תוסף זה'
  if (status === 404) return 'התוסף לא נמצא, אינו תוסף שירות, או שתוספי השירות אינם פעילים באתר'
  return 'לא הצלחנו לטעון את פרטי ההגשות. נסו שוב מאוחר יותר.'
}

async function fetchManage(base: string): Promise<ManageLoad> {
  try {
    const response = await fetch(`${base}/manage`, { cache: 'no-store' })
    if (!response.ok) return { phase: 'error', status: response.status, message: loadErrorMessage(response.status) }
    return { phase: 'ready', data: (await response.json()) as ManageResponse }
  } catch {
    return { phase: 'error', status: 0, message: loadErrorMessage(0) }
  }
}

/**
 * הנתונים והפעולות של דף הגשת השירות: GET .../manage, יצירת טיוטה → העלאת כל קובץ ב-PUT גולמי (בזה
 * אחר זה) → הקפאה (seal), ביטול הגשה וחזרה לגרסה הקודמת. ההחלטות בשרת; כאן — סדר הקריאות והמצב.
 */
export function useServiceSubmission(pluginId: string, enabled: boolean) {
  const [load, setLoad] = useState<ManageLoad>({ phase: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [uploadTasks, setUploadTasks] = useState<UploadTaskState[]>([])
  const [submitErrors, setSubmitErrors] = useState<string[]>([])
  const base = `/api/service-plugins/${encodeURIComponent(pluginId)}`

  const reload = useCallback(async () => {
    setLoad(await fetchManage(base))
  }, [base])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    fetchManage(base).then((next) => {
      if (!cancelled) setLoad(next)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, base])

  const markTask = (key: string, state: UploadTaskState['state']) =>
    setUploadTasks((tasks) => tasks.map((t) => (t.key === key ? { ...t, state } : t)))

  const submit = useCallback(async (form: SubmissionForm, pluginFile: File): Promise<boolean> => {
    setSubmitting(true)
    setSubmitErrors([])
    setUploadTasks([])
    try {
      const draftResponse = await fetch(`${base}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDraftRequest(form, pluginFile))
      })
      const draft = await readJson(draftResponse) as { reviewId?: string; uploads?: Record<string, string> } | null
      if (!draftResponse.ok || !draft?.reviewId || !draft.uploads) {
        setSubmitErrors(apiErrorMessages(draft, 'יצירת ההגשה נכשלה'))
        return false
      }

      const queue = buildUploadQueue(draft.uploads, pluginFile, form)
      setUploadTasks(queue.map((t) => ({ key: t.key, label: t.label, state: 'pending' })))
      for (const task of queue) {
        markTask(task.key, 'uploading')
        let response: Response
        try {
          response = await fetch(task.url, { method: 'PUT', body: task.file })
        } catch {
          markTask(task.key, 'error')
          setSubmitErrors([`ההעלאה של ${task.label} נקטעה (שגיאת רשת)`, 'ההגשה נשארה כטיוטה: בטלו אותה והגישו מחדש.'])
          return false
        }
        if (!response.ok) {
          markTask(task.key, 'error')
          setSubmitErrors([
            ...apiErrorMessages(await readJson(response), `ההעלאה של ${task.label} נכשלה`),
            'ההגשה נשארה כטיוטה: בטלו אותה והגישו מחדש.'
          ])
          return false
        }
        markTask(task.key, 'done')
      }

      const sealResponse = await fetch(`${base}/drafts/${encodeURIComponent(draft.reviewId)}/seal`, { method: 'POST' })
      if (!sealResponse.ok) {
        setSubmitErrors([
          ...apiErrorMessages(await readJson(sealResponse), 'הקפאת ההגשה נכשלה'),
          'כדי לתקן — בטלו את ההגשה והגישו מחדש.'
        ])
        return false
      }
      return true
    } catch (error) {
      setSubmitErrors([error instanceof Error ? error.message : 'ההגשה נכשלה'])
      return false
    } finally {
      setSubmitting(false)
      await reload()
    }
  }, [base, reload])

  /** פעולת POST/DELETE פשוטה; מחזירה null בהצלחה או את הודעות השגיאה */
  const act = useCallback(async (url: string, method: 'POST' | 'DELETE', fallback: string): Promise<string[] | null> => {
    try {
      const response = await fetch(url, { method })
      if (!response.ok) return apiErrorMessages(await readJson(response), fallback)
      return null
    } catch {
      return [fallback]
    } finally {
      await reload()
    }
  }, [reload])

  const cancelReview = useCallback(
    (reviewId: string) => act(`${base}/drafts/${encodeURIComponent(reviewId)}`, 'DELETE', 'ביטול ההגשה נכשל'),
    [act, base]
  )
  const rollback = useCallback(() => act(`${base}/rollback`, 'POST', 'החזרה לגרסה הקודמת נכשלה'), [act, base])

  return { load, reload, submit, submitting, uploadTasks, submitErrors, cancelReview, rollback }
}

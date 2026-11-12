'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Button from './Button'
import Dialog from './Dialog'

/**
 * דיאלוג אישור מפורש — במקום window.confirm, showConfirm ודיאלוגים ייעודיים. מבוסס ui/Dialog (כותרת
 * עם קישוט, גיליון תחתון בטלפון, לכידת פוקוס, Esc ורקע סוגרים = ביטול). אחד לכל הניהול.
 *
 * title — שאלה קצרה ("למחוק לצמיתות 12 העלאות?"). שם הספר — בגוף (body), לא בכותרת.
 * details — רשימה קצרה של מה יקרה (בלי תיבה צבעונית), מתחת לגוף.
 * tone="danger" — לפעולה שאי אפשר לבטל (מחק לצמיתות, רוקן אשפה, אפס עותק): כפתור האישור בצבע
 * השגיאה, והפוקוס הראשון על "ביטול" (data-autofocus), כדי ש-Enter מהיר לא ימחק.
 * busy — הפעולה רצה: אי אפשר לסגור, והאישור מציג טעינה (busyLabel).
 *
 * @param {{ title: import('react').ReactNode, body?: import('react').ReactNode, details?: string[],
 *   confirmLabel: string, cancelLabel?: string, busyLabel?: string, busy?: boolean,
 *   tone?: 'danger' | 'default', onConfirm: () => void, onCancel: () => void }} props
 */
export default function ConfirmDialog({ title, body, details, confirmLabel, cancelLabel = 'ביטול', busyLabel, busy = false, tone = 'default', onConfirm, onCancel }) {
  const danger = tone === 'danger'
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      dismissible={!busy}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onCancel} disabled={busy} data-autofocus={danger ? '' : undefined}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'filled'} size="sm" onClick={onConfirm} loading={busy} data-autofocus={danger ? undefined : ''} data-confirm="">
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </>
      )}
    >
      {(body || details?.length > 0) && (
        <div className="flex flex-col gap-3 text-center text-body-md text-on-surface-variant">
          {body && <div>{body}</div>}
          {details?.length > 0 && (
            <ul className="mx-auto flex max-w-measure list-disc flex-col gap-1 ps-5 text-start text-body-sm">
              {details.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  )
}

/**
 * useConfirm — דיאלוג אישור כהבטחה: `if (await confirm({ title, confirmLabel, tone: 'danger' })) ...`.
 * מחזיר [confirm, element]; את element מרנדרים פעם אחת במסך. מסך שיורד כשהדיאלוג פתוח — ההבטחה
 * נפתרת ב-false (ולא נשארת תלויה).
 * @returns {[(options: { title: import('react').ReactNode, body?: import('react').ReactNode, details?: string[],
 *   confirmLabel: string, cancelLabel?: string, tone?: 'danger' | 'default' }) => Promise<boolean>, import('react').ReactNode]}
 */
export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolveRef.current?.(false)
    resolveRef.current = resolve
    setRequest(options)
  }), [])

  useEffect(() => () => {
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  const settle = (answer) => {
    resolveRef.current?.(answer)
    resolveRef.current = null
    setRequest(null)
  }

  const element = request
    ? <ConfirmDialog {...request} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    : null

  return [confirm, element]
}

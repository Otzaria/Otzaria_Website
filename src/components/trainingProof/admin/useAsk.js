'use client'

import { useCallback } from 'react'
import { useDialog } from '@/components/providers/DialogContext'

// חלון-אישור בתוך הדף, כ-Promise שמתקיים רק באישור. בצורת ה-callback של showConfirm —
// בצורת ה-Promise שלו, טקסט לכפתור האישור הופך גם לטקסט של כפתור הביטול.
export function useAsk() {
  const { showConfirm, showAlert } = useDialog()
  const ask = useCallback(
    (title, message, confirmText = 'אישור') => new Promise((resolve) => showConfirm(title, message, () => resolve(true), confirmText, 'ביטול')),
    [showConfirm]
  )
  return { ask, showAlert }
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SESSION_EXPIRED_MESSAGE, errorMessage } from '@/components/admin/list/adminRequest'
import type { AdminResponse } from './servicePluginsAdminLogic'

/** כשל בטעינה: status — כדי להבחין בין התחברות שפגה (401), אין הרשאה (403) ותקלה שאפשר לנסות שוב */
export interface ServiceLoadError {
  message: string
  status: number
  sessionExpired: boolean
}

export type ServiceLoad =
  | { phase: 'loading' }
  | { phase: 'ready'; data: AdminResponse }
  | { phase: 'disabled' }
  | { phase: 'error'; message: string; error: ServiceLoadError }

const FALLBACK = 'לא הצלחנו לטעון את תוספי השירות.'

function failed(status: number): ServiceLoad {
  const sessionExpired = status === 401
  const message = sessionExpired ? SESSION_EXPIRED_MESSAGE : errorMessage(status, FALLBACK, null)
  return { phase: 'error', message, error: { message, status, sessionExpired } }
}

async function fetchAdmin(): Promise<ServiceLoad> {
  try {
    // redirect: 'manual' — התחברות שפגה מגיעה כהפניה לדף ההתחברות, לא כ-200 עם HTML
    const response = await fetch('/api/service-plugins/admin', { cache: 'no-store', redirect: 'manual' })
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) return failed(401)
    // 404 — התכונה כבויה באתר (לא שגיאה: אין מה להציג)
    if (response.status === 404) return { phase: 'disabled' }
    if (!response.ok) return failed(response.status)
    return { phase: 'ready', data: (await response.json()) as AdminResponse }
  } catch {
    return failed(0)
  }
}

export interface ServiceAdminSource {
  load: ServiceLoad
  reload: () => Promise<void>
}

/**
 * ההגשות של תוספי השירות (GET /api/service-plugins/admin — קריאה בלבד; הפעולות נשלחות מהמסך, בלי
 * שינוי בחוזה). נטען פעם אחת במסך התוספים — גם בשביל המונה בלשונית, לפני שנכנסים לתצוגה.
 * enabled=false — לא נטען (רכיב שקיבל את הנתונים מבחוץ). תשובה ישנה לא דורסת חדשה (seq).
 */
export function useServiceAdminData(enabled = true): ServiceAdminSource {
  const [load, setLoad] = useState<ServiceLoad>({ phase: 'loading' })
  const seq = useRef(0)
  const reload = useCallback(async () => {
    const id = ++seq.current
    const next = await fetchAdmin()
    if (id === seq.current) setLoad(next)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    const id = ++seq.current
    fetchAdmin().then((next) => {
      if (id === seq.current) setLoad(next)
    })
    return () => {
      seq.current += 1
    }
  }, [enabled])

  return { load, reload }
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildDirectPluginInstallUrl } from '@/lib/pluginInstall'

// כמה זמן ממתינים לדיווח מהאפליקציה לפני שמוותרים.
// אי-דיווח אינו שגיאה — ייתכן שמותקנת גרסת אפליקציה ישנה שאינה מדווחת.
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 2 * 60 * 1000

// אם בקשת הורדת הקובץ לא הגיעה לשרת תוך פרק זמן זה — אוצריא כנראה לא
// נפתחה כלל (לא מותקנת). נדיב מספיק כדי לכסות גם עליית אפליקציה "קרה".
const NO_DOWNLOAD_TIMEOUT_MS = 30 * 1000

export type InstallPhase = 'idle' | 'waiting' | 'success' | 'failure' | 'no_report' | 'no_app'

export interface DirectInstallState {
  phase: InstallPhase
  pluginId: string | null
  error: string | null
}

// ניהול התקנה ישירה עם מעקב תוצאה: יוצר טוקן, מנווט ל-otzaria:// עם הטוקן,
// ועושה polling על סטטוס הדיווח מהאפליקציה. אם יצירת הטוקן נכשלת —
// מנווט בלי טוקן (בדיוק כמו ההתנהגות הישנה) ולא מציג מעקב.
export function useDirectInstall() {
  const [state, setState] = useState<DirectInstallState>({ phase: 'idle', pluginId: null, error: null })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const install = useCallback(async (plugin: { id: string; downloadUrl: string }) => {
    stopPolling()

    let token: string | null = null
    try {
      const res = await fetch(`/api/plugins/${plugin.id}/install-token`, { method: 'POST' })
      if (res.ok) {
        token = (await res.json()).token || null
      }
    } catch {
      // ללא טוקן פשוט אין מעקב — ההתקנה עצמה ממשיכה כרגיל
    }

    window.location.href = buildDirectPluginInstallUrl(
      plugin.downloadUrl,
      window.location.origin,
      token || undefined
    )

    if (!token) {
      setState({ phase: 'idle', pluginId: null, error: null })
      return
    }

    setState({ phase: 'waiting', pluginId: plugin.id, error: null })
    const startedAt = Date.now()
    const activeToken = token

    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling()
        setState({ phase: 'no_report', pluginId: plugin.id, error: null })
        return
      }
      // חיסכון בבקשות כשהמשתמש עבר לחלון האפליקציה
      if (document.hidden) return

      try {
        const res = await fetch(`/api/plugins/install-result?token=${encodeURIComponent(activeToken)}`)
        if (res.status === 404) {
          stopPolling()
          setState({ phase: 'no_report', pluginId: plugin.id, error: null })
          return
        }
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'success') {
          stopPolling()
          setState({ phase: 'success', pluginId: plugin.id, error: null })
        } else if (data.status === 'failure') {
          stopPolling()
          setState({ phase: 'failure', pluginId: plugin.id, error: data.error || null })
        } else if (
          !data.downloaded &&
          Date.now() - startedAt > NO_DOWNLOAD_TIMEOUT_MS
        ) {
          // בקשת ההורדה לא הגיעה לשרת — אוצריא כנראה לא נפתחה (לא מותקנת)
          stopPolling()
          setState({ phase: 'no_app', pluginId: plugin.id, error: null })
        }
      } catch {
        // שגיאת רשת זמנית — ננסה שוב בסבב הבא
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  const dismiss = useCallback(() => {
    stopPolling()
    setState({ phase: 'idle', pluginId: null, error: null })
  }, [stopPolling])

  return { installState: state, install, dismiss }
}

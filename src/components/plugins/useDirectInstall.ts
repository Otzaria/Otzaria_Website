'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildDirectPluginInstallUrl } from '@/lib/pluginInstall'

// כמה זמן ממתינים לדיווח מהאפליקציה לפני שמוותרים.
// אי-דיווח אינו שגיאה — ייתכן שמותקנת גרסת אפליקציה ישנה שאינה מדווחת.
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 2 * 60 * 1000

// אם לא הגיע לשרת שום אות חיים מהאפליקציה תוך פרק זמן זה — אוצריא כנראה
// לא נפתחה כלל (לא מותקנת). אותות חיים: אישור קבלה (received — נשלח מ-main()
// של אוצריא מיד עם קבלת הקישור, לפני עליית החלון, גם בעלייה קרה) או בקשת
// הורדת הקובץ. הבדיקה נעשית על טיקי ה-polling (כל 2 שניות), כך שבפועל
// ההכרזה נופלת על הטיק הראשון שאחרי הסף (~4 שניות מהלחיצה).
const NO_SIGNAL_TIMEOUT_MS = 3 * 1000

export type InstallPhase = 'idle' | 'waiting' | 'success' | 'failure' | 'no_report' | 'no_app'

export interface DirectInstallState {
  phase: InstallPhase
  pluginId: string | null
  error: string | null
  // התוסף כבר היה מותקן ורק עודכן. גרסת אוצריא שאינה מדווחת על כך משאירה
  // false, ואז מוצג נוסח ההתקנה.
  updated: boolean
}

// ניהול התקנה ישירה עם מעקב תוצאה: יוצר טוקן, מנווט ל-otzaria:// עם הטוקן,
// ועושה polling על סטטוס הדיווח מהאפליקציה. אם יצירת הטוקן נכשלת —
// מנווט בלי טוקן (בדיוק כמו ההתנהגות הישנה) ולא מציג מעקב.
export function useDirectInstall() {
  const [state, setState] = useState<DirectInstallState>({ phase: 'idle', pluginId: null, error: null, updated: false })
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
      setState({ phase: 'idle', pluginId: null, error: null, updated: false })
      return
    }

    setState({ phase: 'waiting', pluginId: plugin.id, error: null, updated: false })
    const startedAt = Date.now()
    const activeToken = token

    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling()
        setState({ phase: 'no_report', pluginId: plugin.id, error: null, updated: false })
        return
      }
      // חיסכון בבקשות כשהמשתמש עבר לחלון האפליקציה
      if (document.hidden) return

      try {
        const res = await fetch(`/api/plugins/install-result?token=${encodeURIComponent(activeToken)}`)
        if (res.status === 404) {
          stopPolling()
          setState({ phase: 'no_report', pluginId: plugin.id, error: null, updated: false })
          return
        }
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'success') {
          stopPolling()
          setState({ phase: 'success', pluginId: plugin.id, error: null, updated: data.updated === true })
        } else if (data.status === 'failure') {
          stopPolling()
          setState({ phase: 'failure', pluginId: plugin.id, error: data.error || null, updated: false })
        } else if (
          !data.received &&
          !data.downloaded &&
          Date.now() - startedAt > NO_SIGNAL_TIMEOUT_MS
        ) {
          // שום אות חיים לא הגיע לשרת — אוצריא כנראה לא נפתחה (לא מותקנת)
          stopPolling()
          setState({ phase: 'no_app', pluginId: plugin.id, error: null, updated: false })
        }
      } catch {
        // שגיאת רשת זמנית — ננסה שוב בסבב הבא
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  const dismiss = useCallback(() => {
    stopPolling()
    setState({ phase: 'idle', pluginId: null, error: null, updated: false })
  }, [stopPolling])

  return { installState: state, install, dismiss }
}

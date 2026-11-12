'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'

/**
 * מפנה לדף ההתחברות (עם callbackUrl לנתיב הנוכחי) כאשר המשתמש אינו מאומת.
 * מרכז את הדפוס שהיה משוכפל (עם ניואנסים שונים) בדפי ספרייה רבים.
 *
 * לא מבצע בדיקות תפקיד/הרשאה - אלה נשארות באחריות הדף הקורא, כי יעדי
 * ההפניה וההיגיון שונים מדף לדף.
 *
 * @param {{ localFallback?: { user: { id: string, name?: string, role?: string }, offline: boolean } | null }} [options]
 * @returns {{ session: import('next-auth').Session | null | undefined, status: 'loading'|'authenticated'|'unauthenticated' }}
 */
export function useRequireAuth({ localFallback = null } = {}) {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'unauthenticated' && !localFallback) {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(pathname)}`)
    }
  }, [status, pathname, router, localFallback])

  useEffect(() => {
    if (!localFallback || !update) return
    const reconnect = () => { if (navigator.onLine !== false) void update().catch(() => {}) }
    window.addEventListener('online', reconnect)
    window.addEventListener('focus', reconnect)
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect) }
  }, [localFallback, update])

  return localFallback && !session
    ? { session: localFallback, status: 'authenticated' }
    : { session, status }
}

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
 * @returns {{ session: import('next-auth').Session | null | undefined, status: 'loading'|'authenticated'|'unauthenticated' }}
 */
export function useRequireAuth() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(pathname)}`)
    }
  }, [status, pathname, router])

  return { session, status }
}

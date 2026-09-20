'use client'

import { useEffect, useState } from 'react'
import { getProviders, signIn } from 'next-auth/react'
import { SIGNUP_INTENT_KEY } from '@/lib/googleSignup'

// מטמון ברמת המודול — בדיקה אחת מול /api/auth/providers לכל טעינת דף.
let providersPromise = null
function isGoogleEnabled() {
  providersPromise ??= getProviders().catch(() => null)
  return providersPromise.then((providers) => Boolean(providers?.google))
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

// כפתור "התחברות עם Google" — מוצג רק כשהספק מוגדר בשרת (אחרת לא מרונדר כלל).
// loginHint ממלא מראש את חשבון הגוגל המתאים (למשל מייל החשבון בדף האימות).
// signupIntent=true מסמן שהלחיצה הגיעה ממסלול ההרשמה, כדי שמסך השלמת הפרטים
// ידלג על ההסבר "אין לך עדיין חשבון".
// withDivider מוסיף מפריד "או" מעל הכפתור — חלק מהרכיב כדי שלא יוצג מפריד יתום
// כשהכפתור מוסתר.
export default function GoogleSignInButton({ callbackUrl, loginHint, label = 'התחברות עם Google', signupIntent = false, withDivider = false, className = '' }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    isGoogleEnabled().then((ok) => { if (active) setEnabled(ok) })
    return () => { active = false }
  }, [])

  if (!enabled) return null

  const handleClick = () => {
    setLoading(true)
    if (signupIntent) {
      try { sessionStorage.setItem(SIGNUP_INTENT_KEY, '1') } catch { /* מצב פרטי/חסימת אחסון */ }
    }
    signIn('google', { callbackUrl }, loginHint ? { login_hint: loginHint } : undefined)
  }

  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`w-full flex items-center justify-center gap-3 py-3 border border-neutral-300 bg-white text-neutral-700 rounded-lg font-medium hover:bg-neutral-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${withDivider ? '' : className}`}
    >
      <GoogleLogo />
      <span>{loading ? 'מעביר ל-Google...' : label}</span>
    </button>
  )

  if (!withDivider) return button
  return (
    <div className={className}>
      <div className="flex items-center gap-3 my-4 text-sm text-neutral-400">
        <span className="flex-1 border-t border-neutral-200" />
        <span>או</span>
        <span className="flex-1 border-t border-neutral-200" />
      </div>
      {button}
    </div>
  )
}

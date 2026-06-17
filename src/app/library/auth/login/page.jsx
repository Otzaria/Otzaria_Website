'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const DEFAULT_REDIRECT = '/library/dashboard'

// מאשר רק יעד פנימי בטוח לפני ניווט מלא, ומונע שתי בעיות:
// 1. open-redirect — ?callbackUrl=https://evil.com או //evil.com (protocol-relative).
//    מקבלים אך ורק נתיב יחסי שמתחיל ב-"/" יחיד (לא "//" ולא "/\").
// 2. לופ רענון — ניתוב חזרה לדף ההתחברות עצמו. נופלים חזרה ליעד ברירת המחדל.
function getSafeCallbackUrl(raw) {
  if (!raw || raw[0] !== '/') return DEFAULT_REDIRECT
  // "//" או "/\" מתפרשים בדפדפן כ-origin חיצוני
  if (raw[1] === '/' || raw[1] === '\\') return DEFAULT_REDIRECT
  const pathOnly = raw.split(/[?#]/)[0]
  if (pathOnly === '/library/auth/login' || pathOnly.startsWith('/library/auth/login/')) {
    return DEFAULT_REDIRECT
  }
  return raw
}

// ניווט מלא (ולא router.replace צד-לקוח) בכוונה:
// לאחר signIn ה-cookie נכתב, אך ה-SessionProvider וה-Router Cache של Next
// עדיין לא תמיד מעודכנים. ניווט צד-לקוח לדף מוגן עלול להישלף מ-cache ישן
// (הניתוב חזרה ל-login מהביקור הלא-מאומת), והשומר בדשבורד מחזיר ל-login —
// ונוצר לופ שנפתר רק ברענון ידני. ניווט מלא מכריח את ה-middleware לקרוא
// את ה-cookie החדש בצד שרת ומונע את הלופ.
function redirectAfterLogin(searchParams) {
  window.location.assign(getSafeCallbackUrl(searchParams.get('callbackUrl')))
}

function LoginContent() {
  const searchParams = useSearchParams()
  const passwordRef = useRef(null)
  
  const { status } = useSession()

  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [isRedirecting, setIsRedirecting] = useState(false)

  // בדיקה אם המשתמש התחבר (בלשונית זו או אחרת)
  useEffect(() => {
    if (status === 'authenticated' && !isRedirecting) {
      // דגל חד-פעמי למניעת ניתוב כפול בתגובה לשינוי סטטוס האימות
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRedirecting(true)
      redirectAfterLogin(searchParams)
    }
  }, [status, searchParams, isRedirecting])

  useEffect(() => {
    const errorType = searchParams.get('error')
    
    if (errorType === 'InvalidToken') {
      // הצגת הודעת שגיאה בתגובה לפרמטר error שב-URL
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('קישור האימות אינו תקין או שכבר נעשה בו שימוש.')
    } else if (errorType === 'TokenExpired') {
      setError('קישור האימות פג תוקף. אנא בקש קישור אימות חדש.')
    } else if (errorType === 'ServerError') {
      setError('אירעה שגיאה בתקשורת מול השרת, אנא התחבר מחדש.')
    }
  }, [searchParams])

  const handleUsernameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // אם יש טקסט בשדה הסיסמה, בצע התחברות
      if (formData.password.trim()) {
        handleSubmit(e)
      } else {
        // אחרת, עבור לשדה הסיסמה
        passwordRef.current?.focus()
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        redirect: false,
        identifier: formData.identifier,
        password: formData.password,
      })

      if (result?.error) {
        setError('שם משתמש או סיסמה שגויים')
        setLoading(false)
      } else {
        // משאירים loading=true כדי שהכפתור יישאר במצב טעינה עד שהדף נטען מחדש.
        redirectAfterLogin(searchParams)
      }
    } catch {
      setError('שגיאה בהתחברות')
      setLoading(false)
    }
  }

  // תצוגת טעינה אם המצב הוא Loading או שאנחנו כבר מזוהים
  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="w-full max-w-md flex justify-center items-center min-h-[400px]">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
        <div className="glass-strong rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <Link href="/library">
              <Image src="/logo.png" alt="לוגו אוצריא" width={80} height={80} />
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-center mb-2 text-on-surface">
            התחברות
          </h1>
          
          {searchParams.get('callbackUrl') && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800">
              <span className="material-symbols-outlined text-amber-600">info</span>
              <span className="text-sm font-medium">פעולה זו דורשת התחברות</span>
            </div>
          )}
          
          <p className="text-center text-on-surface/70 mb-8">
            ברוכים השבים לספריית אוצריא
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <span className="material-symbols-outlined">error</span>
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">
                שם משתמש או אימייל
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface/50">
                  person
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  onKeyDown={handleUsernameKeyDown}
                  value={formData.identifier}
                  onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-on-surface"
                  placeholder="שם משתמש או your@email.com"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-on-surface">
                  סיסמה
                </label>
                <Link 
                  href="/library/auth/forgot-password" 
                  className="text-xs text-primary hover:text-accent font-medium transition-colors"
                >
                  שכחת סיסמה?
                </Link>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface/50">
                  lock
                </span>
                <input
                  type="password"
                  required
                  ref={passwordRef}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-on-surface"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>מתחבר...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">login</span>
                  <span>התחבר</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-on-surface/70">
              עדיין אין לך חשבון?{' '}
              <Link href="/library/auth/register" className="text-primary font-medium hover:text-accent">
                הירשם עכשיו
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link href="/library" className="text-sm text-on-surface/60 hover:text-primary flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
              <span>חזרה לדף הבית</span>
            </Link>
          </div>
        </div>
      </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-bl from-primary-container via-background to-secondary-container">
      <Suspense fallback={
        <div className="flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  )
}
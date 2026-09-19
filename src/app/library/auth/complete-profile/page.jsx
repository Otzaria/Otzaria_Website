'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import CompleteProfileForm from '@/components/auth/CompleteProfileForm'
import { SIGNUP_INTENT_KEY } from '@/lib/googleSignup'

function readSignupIntent() {
  try {
    const value = sessionStorage.getItem(SIGNUP_INTENT_KEY)
    sessionStorage.removeItem(SIGNUP_INTENT_KEY)
    return value === '1'
  } catch {
    return false
  }
}

function CompleteProfileContent() {
  const token = useSearchParams().get('t')

  const [pending, setPending] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [name, setName] = useState('')
  const [acceptReminders, setAcceptReminders] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!token) return

    fetch(`/api/auth/complete-profile?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!active) return
        if (!res.ok) {
          setLoadError(data.error || 'הקישור אינו תקין או שפג תוקפו.')
          return
        }
        setPending(data)
        setName(data.suggestedName || '')
        // מי שהגיע ממסלול ההרשמה מדלג על מסך ההסבר ורואה מיד את הטופס.
        setShowForm(readSignupIntent())
      })
      .catch(() => { if (active) setLoadError('שגיאת תקשורת. נסה שוב.') })
    return () => { active = false }
  }, [token])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, acceptReminders }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'שגיאה ביצירת החשבון')
        setSubmitting(false)
        return
      }
      // החשבון קיים מעכשיו — התחברות מיידית דרך Google (בלי בקשת הרשאה נוספת).
      signIn('google', { callbackUrl: '/library/dashboard' })
    } catch {
      setError('שגיאת תקשורת')
      setSubmitting(false)
    }
  }, [token, name, acceptReminders])

  const card = (children) => (
    <div className="w-full max-w-md">
      <div className="glass-strong rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <Link href="/library">
            <Image src="/logo.png" alt="לוגו אוצריא" width={80} height={80} />
          </Link>
        </div>
        {children}
      </div>
    </div>
  )

  // חסר טוקן — נגזר מה-URL עצמו, בלי state (אין צורך ברינדור נוסף).
  const fatalError = token ? loadError : 'הקישור אינו תקין. יש להתחיל מחדש מדף ההרשמה.'

  if (fatalError) {
    return card(
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4 text-on-surface">לא הצלחנו להמשיך</h1>
        <p className="text-on-surface/70 mb-8">{fatalError}</p>
        <Link
          href="/library/auth/register"
          className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all"
        >
          <span className="material-symbols-outlined">person_add</span>
          <span>לדף ההרשמה</span>
        </Link>
      </div>
    )
  }

  if (!pending) {
    return card(
      <div className="flex justify-center py-8">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    )
  }

  // מסך הסבר ידידותי למי שהגיע מדף ההתחברות ואין לו עדיין חשבון.
  if (!showForm) {
    return card(
      <div className="text-center">
        <span className="material-symbols-outlined text-5xl text-primary mb-3 block">waving_hand</span>
        <h1 className="text-2xl font-bold mb-3 text-on-surface">ברוך הבא לאוצריא!</h1>
        <p className="text-on-surface/70 mb-2">
          עדיין אין חשבון המשויך לכתובת <strong dir="ltr" className="font-semibold">{pending.email}</strong>.
        </p>
        <p className="text-on-surface/70 mb-8">
          אפשר לפתוח חשבון עכשיו — נשאר רק לבחור שם משתמש, בלי סיסמה ובלי אימות מייל.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all"
        >
          <span className="material-symbols-outlined">person_add</span>
          <span>השלם פרטים כעת</span>
        </button>
        <Link
          href="/auth/login"
          className="mt-4 flex items-center justify-center gap-2 w-full py-3 border border-primary text-primary rounded-lg font-medium hover:bg-primary-container transition-all"
        >
          <span className="material-symbols-outlined">login</span>
          <span>יש לי כבר חשבון אחר</span>
        </Link>
      </div>
    )
  }

  return card(
    <>
      <h1 className="text-2xl font-bold text-center mb-2 text-on-surface">השלמת פרטים</h1>
      <p className="text-center text-on-surface/70 mb-8">עוד פרט אחד והחשבון מוכן</p>
      <CompleteProfileForm
        email={pending.email}
        name={name}
        onNameChange={setName}
        acceptReminders={acceptReminders}
        onAcceptRemindersChange={setAcceptReminders}
        onSubmit={handleSubmit}
        loading={submitting}
        error={error}
      />
    </>
  )
}

export default function CompleteProfilePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-bl from-primary-container via-background to-secondary-container" dir="rtl">
      <Suspense fallback={
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      }>
        <CompleteProfileContent />
      </Suspense>
    </div>
  )
}

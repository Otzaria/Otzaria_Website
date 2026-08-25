'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function RegisterPage() {
  const router = useRouter()
  // הגדרת ה-State עם הפרמטר acceptReminders
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptReminders: false, // זהו הפרמטר שיישלח לשרת
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // בדיקות ולידציה מקדימות
    if (!formData.name.trim()) {
      setError('נא להזין שם משתמש')
      setLoading(false)
      return
    }

    if (formData.name.length < 2) {
      setError('שם המשתמש חייב להכיל לפחות 2 תווים')
      setLoading(false)
      return
    }

    if (formData.name.length > 50) {
      setError('שם המשתמש ארוך מדי (מקסימום 50 תווים)')
      setLoading(false)
      return
    }

    if (!formData.email.trim()) {
      setError('נא להזין כתובת אימייל')
      setLoading(false)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('כתובת האימייל אינה תקינה')
      setLoading(false)
      return
    }

    if (formData.password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים')
      setLoading(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('הסיסמאות אינן תואמות - נא לוודא שהזנת את אותה סיסמה פעמיים')
      setLoading(false)
      return
    }

    try {
      // שלב 1: הרשמה
      // formData כולל את acceptReminders ולכן הוא נשלח לשרת
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.error) {
          setError(data.error)
        } else if (response.status === 400) {
          setError('הנתונים שהוזנו אינם תקינים, נא לבדוק ולנסות שוב')
        } else if (response.status === 500) {
          setError('שגיאת שרת - נא לנסות שוב מאוחר יותר')
        } else {
          setError('שגיאה בהרשמה - נא לנסות שוב')
        }
        setLoading(false)
        return
      }

      // שלב 2: התחברות אוטומטית
      const result = await signIn('credentials', {
        identifier: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (result?.error) {
        router.push('/auth/login?registered=true')
      } else {
        router.push('/library/dashboard')
      }
    } catch (err) {
      console.error('Registration error:', err)
      setError('שגיאה בהרשמה - נא לבדוק את החיבור לאינטרנט ולנסות שוב')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-bl from-primary-container via-background to-secondary-container">
      <div className="w-full max-w-md">
        <div className="glass-strong rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Link href="/library">
              <Image src="/logo.png" alt="לוגו אוצריא" width={80} height={80} />
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-center mb-2 text-on-surface">
            הרשמה
          </h1>
          <p className="text-center text-on-surface/70 mb-8">
            הצטרף לקהילת עורכי אוצריא
          </p>

          {error && (
            <div className="mb-6 p-4 bg-danger-50 border-2 border-danger-300 rounded-lg animate-shake">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-danger-600 text-2xl flex-shrink-0">
                  error
                </span>
                <div className="flex-1">
                  <h3 className="font-bold text-danger-800 mb-1">שגיאה בהרשמה</h3>
                  <p className="text-danger-700 text-sm">{error}</p>
                </div>
                <button
                  onClick={() => setError('')}
                  className="text-danger-400 hover:text-danger-600 transition-colors"
                  type="button"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">
                שם משתמש
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface/50">
                  person
                </span>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-on-surface"
                  placeholder="שם משתמש ייחודי"
                />
              </div>
              <p className="text-xs text-on-surface/60 mt-1">
                תוכל להתחבר עם שם המשתמש או האימייל
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">
                אימייל
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface/50">
                  email
                </span>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-on-surface"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">
                סיסמה
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface/50">
                  lock
                </span>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-on-surface"
                  placeholder="לפחות 8 תווים"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">
                אימות סיסמה
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface/50">
                  lock_reset
                </span>
                <input
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-on-surface"
                  placeholder="הזן סיסמה שוב"
                />
              </div>
            </div>

            <div className="flex items-start gap-3 mt-2">
              <div className="flex items-center h-5">
                <input
                  id="reminders"
                  type="checkbox"
                  checked={formData.acceptReminders}
                  onChange={(e) => setFormData({ ...formData, acceptReminders: e.target.checked })}
                  className="w-4 h-4 rounded border-surface-variant text-primary focus:ring-primary focus:ring-2 cursor-pointer bg-background"
                />
              </div>
              <label htmlFor="reminders" className="text-sm text-on-surface/80 cursor-pointer select-none leading-5">
                אני מאשר קבלת תזכורות במייל על עמודים וספרים שלא סיימתי
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>נרשם...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">person_add</span>
                  <span>הירשם</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-on-surface/70">
              כבר יש לך חשבון?{' '}
              <Link href="/auth/login" className="text-primary font-medium hover:text-accent">
                התחבר
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
    </div>
  )
}

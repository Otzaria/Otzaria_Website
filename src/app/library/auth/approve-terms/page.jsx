'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Image from 'next/image'

export default function ApproveTermsPage() {
  const router = useRouter()
  const { update } = useSession() 
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!accepted) {
      setError('חובה לאשר את התיבה כדי להמשיך')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/approve-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptReminders: true }),
      })

      if (!res.ok) {
        throw new Error('שגיאה בעדכון הנתונים')
      }

      await update({ acceptReminders: true })

      router.refresh()
      router.push('/library/dashboard')
      
    } catch (err) {
      console.error(err)
      setError('אירעה שגיאה, נא לנסות שוב')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-bl from-primary-container via-background to-secondary-container">
      <div className="w-full max-w-md">
        <div className="glass-strong rounded-2xl p-8 shadow-2xl border border-primary/20">
          
          {/* Logo */}
          <div className="flex justify-center mb-6">
             <Image src="/logo.png" alt="לוגו אוצריא" width={70} height={70} />
          </div>

          <h1 className="text-2xl font-bold text-center mb-4 text-on-surface">
            נדרש אישור נוסף
          </h1>
          
          <p className="text-center text-on-surface/70 mb-8 text-sm leading-relaxed">
            כדי להשלים את הכניסה למערכת ולשמור על חוויית שימוש רציפה, 
            אנו זקוקים לאישור שלך לקבלת תזכורות על עמודים וספרים שלא סיימת לערוך.
          </p>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            
            <div className="bg-surface-variant/30 p-4 rounded-xl border border-surface-variant">
              <div className="flex items-start gap-3">
                <div className="flex items-center h-5 mt-1">
                  <input
                    id="terms-check"
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="w-5 h-5 rounded border-primary text-primary focus:ring-primary focus:ring-2 cursor-pointer bg-background"
                  />
                </div>
                <label htmlFor="terms-check" className="text-sm text-on-surface cursor-pointer select-none leading-relaxed">
                  אני מאשר קבלת תזכורות במייל על עמודים וספרים שלא סיימתי לערוך.
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !accepted}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>מעדכן...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">check_circle</span>
                  <span>אישור והמשך</span>
                </>
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}

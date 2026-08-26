'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState({ loading: false, message: '', error: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ loading: true, message: '', error: '' })

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      
      if (res.ok) {
        setStatus({ loading: false, message:  'אם המייל קיים, נשלחה הודעה.' , error: '' })
      } else {
        setStatus({ loading: false, message: '', error: data.error || 'שגיאה בשליחה' })
      }
    } catch (error) {
      setStatus({ loading: false, message: '', error: 'שגיאת תקשורת' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50">
      <div className="max-w-md w-full glass-strong p-8 rounded-2xl shadow-xl text-center">
        <div className="flex justify-center mb-6">
            <Image src="/logo.png" alt="Logo" width={60} height={60} />
        </div>
        <h2 className="text-2xl font-bold mb-4">שחזור סיסמה</h2>
        <p className="text-neutral-600 mb-6">הכנס את המייל שלך ונשלח לך קישור לאיפוס הסיסמה.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
            />
            <button 
                type="submit" 
                disabled={status.loading}
                className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
                {status.loading ? 'שולח...' : 'שלח קישור לאיפוס'}
            </button>
        </form>

        {status.message && <div className="mt-4 p-3 bg-success-100 text-success-700 rounded">{status.message}</div>}
        {status.error && <div className="mt-4 p-3 bg-danger-100 text-danger-700 rounded">{status.error}</div>}

        <div className="mt-6">
            <Link href="/auth/login" className="text-sm text-neutral-500 hover:text-primary">חזרה להתחברות</Link>
        </div>
      </div>
    </div>
  )
}
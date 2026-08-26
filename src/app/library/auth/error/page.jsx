'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const errorMessages = {
    Configuration: 'שגיאה בהגדרות השרת',
    AccessDenied: 'הגישה נדחתה',
    Verification: 'שגיאה באימות',
    Default: 'אירעה שגיאה בהתחברות',
  }

  const errorMessage = errorMessages[error] || errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-bl from-primary-container via-background to-secondary-container">
      <div className="w-full max-w-md">
        <div className="glass-strong rounded-2xl p-8 shadow-2xl text-center">
          <div className="flex justify-center mb-6">
            <Link href="/library">
              <Image src="/logo.png" alt="לוגו אוצריא" width={80} height={80} />
            </Link>
          </div>

          <span className="material-symbols-outlined text-6xl text-danger-500 mb-4 block">
            error
          </span>

          <h1 className="text-3xl font-bold mb-4 text-on-surface">
            שגיאה בהתחברות
          </h1>

          <p className="text-on-surface/70 mb-8">
            {errorMessage}
          </p>

          <div className="space-y-4">
            <Link 
              href="/auth/login"
              className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all"
            >
              <span className="material-symbols-outlined">login</span>
              <span>נסה שוב</span>
            </Link>

            <Link 
              href="/library"
              className="flex items-center justify-center gap-2 w-full py-3 border border-primary text-primary rounded-lg font-medium hover:bg-primary-container transition-all"
            >
              <span className="material-symbols-outlined">home</span>
              <span>חזרה לדף הבית</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">טוען...</div>
      </div>
    }>
      <ErrorContent />
    </Suspense>
  )
}

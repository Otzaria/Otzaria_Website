'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function UnauthorizedPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-bl from-primary-container via-background to-secondary-container">
      <div className="w-full max-w-md">
        <div className="glass-strong rounded-2xl p-8 shadow-2xl text-center">
          <div className="flex justify-center mb-6">
            <Link href="/library" prefetch={false}>
              <Image src="/logo.png" alt="לוגו אוצריא" width={80} height={80} />
            </Link>
          </div>

          <div className="mb-6">
            <span className="material-symbols-outlined text-6xl text-danger-500">block</span>
          </div>

          <h1 className="text-3xl font-bold text-center mb-2 text-on-surface">
            אין הרשאת גישה
          </h1>
          <p className="text-center text-on-surface/70 mb-8">
            הדף שניסית לגשת אליו דורש הרשאות מנהל. אין לך הרשאה לצפות בדף זה.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => router.back()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              <span>חזור לדף הקודם</span>
            </button>

            <Link
              href="/library/dashboard" prefetch={false}
              className="w-full flex items-center justify-center gap-2 py-3 bg-surface text-on-surface rounded-lg font-medium hover:bg-surface-variant transition-all border border-outline"
            >
              <span className="material-symbols-outlined">dashboard</span>
              <span>עבור לדשבורד</span>
            </Link>
          </div>

          <div className="mt-6 text-center">
            <Link href="/library" prefetch={false} className="text-sm text-on-surface/60 hover:text-primary flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-sm">home</span>
              <span>חזרה לדף הבית</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

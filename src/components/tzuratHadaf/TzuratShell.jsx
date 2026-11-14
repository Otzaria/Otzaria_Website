'use client'

import Link from 'next/link'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { BASE_PATH } from './labels'

// המעטפת של דפי המתנדב בצורת הדף: הכותרת העליונה של האתר, שביל ("צורת הדף ›"), כותרת עם אייקון ופעולות.
// children — פונקציה (session) => ReactNode, או ReactNode. עד שההתחברות ידועה — טעינה; בלי התחברות
// useRequireAuth מפנה לדף ההתחברות.
export default function TzuratShell({ title, icon = 'auto_stories', subtitle = null, actions = null, wide = false, crumb = true, children }) {
  const { session, status } = useRequireAuth()
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main id="main-content" className="w-full flex-1 px-4 py-8 sm:px-6">
        <div className={`mx-auto flex flex-col gap-5 ${wide ? 'max-w-[110rem]' : 'max-w-6xl'}`}>
          {crumb && (
            <nav aria-label="שביל" className="flex items-center gap-2 text-sm text-on-surface/60">
              <Link href={BASE_PATH} prefetch={false} className="hover:text-primary">
                צורת הדף
              </Link>
              <span aria-hidden="true">›</span>
              <span className="text-on-surface">{title}</span>
            </nav>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold text-on-surface sm:text-3xl">
                <span aria-hidden="true" className="material-symbols-outlined text-4xl text-accent">{icon}</span>
                {title}
              </h1>
              {subtitle && <p className="mt-2 text-on-surface/70">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {status !== 'authenticated' ? (
            <LoadingSpinner message="טוען..." />
          ) : typeof children === 'function' ? (
            children(session)
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  )
}

/** הודעה למי שאינו מאומת (403) או שגיאה כללית */
export function AccessNotice({ status, error, onRetry = null }) {
  const forbidden = status === 403
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-warning-alt-200 bg-warning-alt-50 p-4 text-warning-alt-800">
      <span aria-hidden="true" className="material-symbols-outlined">{forbidden ? 'lock' : 'error'}</span>
      <div className="flex-1">
        <p className="font-bold">{forbidden ? 'רק משתמשים עם כתובת אימייל מאומתת יכולים להשתתף.' : error || 'משהו השתבש.'}</p>
        {forbidden && <p className="mt-1 text-sm">אמתו את כתובת האימייל בלוח הבקרה, ואחר כך חזרו לכאן.</p>}
        {onRetry && !forbidden && (
          <button type="button" onClick={onRetry} className="mt-2 text-sm font-bold text-primary hover:underline">
            נסו שוב
          </button>
        )}
      </div>
    </div>
  )
}

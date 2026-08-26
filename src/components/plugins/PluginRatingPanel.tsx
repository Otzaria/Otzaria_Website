'use client'

// לוח הדירוגים בדף התוסף: הממוצע, התפלגות 5★→1★, והדירוג של המשתמש עצמו.
//
// הממוצע המוצג הוא הממוצע האמיתי. הציון שלפיו החנות ממיינת (ממוצע מוחלק) הוא
// פנימי ואינו נחשף — ראו src/lib/pluginRating.js.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import RatingStars from '@/components/plugins/RatingStars'
import { useDialog } from '@/components/providers/DialogContext'

interface RatingSummary {
  ratingAvg: number
  ratingCount: number
  ratingVerifiedCount: number
  ratingBreakdown: number[]
  myRating: { value: number; verifiedInstall: boolean } | null
  canRate?: boolean
  isOwnPlugin?: boolean
}

interface PluginRatingPanelProps {
  pluginId: string
  /** מה שהגיע כבר בתשובת התוסף — כדי שהלוח יוצג מיד ולא יקרוץ */
  initial: Pick<RatingSummary, 'ratingAvg' | 'ratingCount' | 'ratingVerifiedCount' | 'ratingBreakdown'>
}

const STAR_LABELS = [5, 4, 3, 2, 1]

export default function PluginRatingPanel({ pluginId, initial }: PluginRatingPanelProps) {
  const { data: session, status: sessionStatus } = useSession()
  const { showAlert, showConfirm } = useDialog() as {
    showAlert: (title: string, message: string) => Promise<void> | void
    showConfirm: (title: string, message: string) => Promise<boolean>
  }

  const [summary, setSummary] = useState<RatingSummary>({
    ratingAvg: initial.ratingAvg || 0,
    ratingCount: initial.ratingCount || 0,
    ratingVerifiedCount: initial.ratingVerifiedCount || 0,
    ratingBreakdown: initial.ratingBreakdown || [0, 0, 0, 0, 0],
    myRating: null
  })
  const [hovered, setHovered] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // טעינת הדירוג של המשתמש הנוכחי (וסיכום מעודכן) — no-store בשרת.
  // ממתינים שהסשן ייושב, אחרת הבקשה נשלחת פעמיים (loading → מצב סופי).
  useEffect(() => {
    if (sessionStatus === 'loading') return
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/plugins/${pluginId}/rating`)
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) setSummary(data)
      } catch (error) {
        console.error('Error loading plugin rating:', error)
      }
    }
    load()
    return () => { cancelled = true }
  }, [pluginId, sessionStatus])

  const submit = async (value: number) => {
    try {
      setSaving(true)
      const response = await fetch(`/api/plugins/${pluginId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'שמירת הדירוג נכשלה')

      setSummary((prev) => ({ ...prev, ...result }))
      await showAlert('תודה!', result.message || 'הדירוג נשמר')
    } catch (error) {
      showAlert('שגיאה', error instanceof Error ? error.message : 'לא הצלחנו לשמור את הדירוג')
    } finally {
      setSaving(false)
      setHovered(null)
    }
  }

  const remove = async () => {
    const confirmed = await showConfirm('הסרת הדירוג', 'להסיר את הדירוג שלך לתוסף זה?')
    if (!confirmed) return
    try {
      setSaving(true)
      const response = await fetch(`/api/plugins/${pluginId}/rating`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'הסרת הדירוג נכשלה')
      setSummary((prev) => ({ ...prev, ...result }))
    } catch (error) {
      showAlert('שגיאה', error instanceof Error ? error.message : 'לא הצלחנו להסיר את הדירוג')
    } finally {
      setSaving(false)
    }
  }

  const { ratingAvg, ratingCount, ratingVerifiedCount, ratingBreakdown, myRating, isOwnPlugin } = summary
  const isLoggedIn = Boolean(session?.user)
  const displayed = hovered ?? myRating?.value ?? 0

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 p-6 mt-6">
      <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">star</span>
        <span>דירוג המשתמשים</span>
      </h2>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* הממוצע */}
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-surface p-5 text-center">
          {ratingCount > 0 ? (
            <>
              <div className="text-4xl font-bold text-on-surface">
                {ratingAvg.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <RatingStars value={ratingAvg} size="lg" />
              <div className="text-sm text-on-surface/60">
                {ratingCount.toLocaleString('he-IL')} {ratingCount === 1 ? 'מדרג' : 'מדרגים'}
              </div>
              {ratingVerifiedCount > 0 && (
                <div
                  className="inline-flex items-center gap-1 text-xs font-bold text-success-700"
                  title="מדרגים שהתקנת התוסף אצלם נרשמה בפועל"
                >
                  <span className="material-symbols-outlined text-sm leading-none">verified</span>
                  <span>{ratingVerifiedCount.toLocaleString('he-IL')} מאומתים</span>
                </div>
              )}
            </>
          ) : (
            <>
              <RatingStars value={0} size="lg" />
              <div className="text-sm text-on-surface/60">התוסף עדיין לא דורג</div>
            </>
          )}
        </div>

        {/* התפלגות */}
        <div className="flex flex-col justify-center gap-2">
          {STAR_LABELS.map((star) => {
            const count = ratingBreakdown[star - 1] || 0
            const percent = ratingCount > 0 ? (count / ratingCount) * 100 : 0
            return (
              <div key={star} className="flex items-center gap-3">
                <span className="flex w-10 shrink-0 items-center justify-end gap-0.5 text-sm text-on-surface/60">
                  {star}
                  <span className="material-symbols-outlined text-sm leading-none text-warning-500">star</span>
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-warning-500 transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-sm text-on-surface/50">{count.toLocaleString('he-IL')}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* הדירוג שלי */}
      <div className="mt-6 border-t border-neutral-100 pt-5">
        {isOwnPlugin ? (
          <p className="text-sm text-on-surface/60">
            זה התוסף שהעלית — מפתח אינו מדרג את התוסף של עצמו.
          </p>
        ) : !isLoggedIn ? (
          <p className="text-sm text-on-surface/70">
            <Link
              href={`/auth/login?callbackUrl=${encodeURIComponent(`/plugins/${pluginId}`)}`}
              className="font-bold text-primary hover:underline"
            >
              התחברו לאתר
            </Link>
            {' '}כדי לדרג את התוסף. דירוג אחד לכל משתמש, וניתן לשנותו בכל עת.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-bold text-on-surface/60">
              {myRating ? 'הדירוג שלך:' : 'דרגו את התוסף:'}
            </span>
            <div className="flex items-center" onMouseLeave={() => setHovered(null)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={saving}
                  onClick={() => submit(star)}
                  onMouseEnter={() => setHovered(star)}
                  onFocus={() => setHovered(star)}
                  className="p-0.5 transition-transform hover:scale-110 disabled:cursor-default disabled:opacity-60"
                  title={`${star} מתוך 5`}
                  aria-label={`דרג ${star} מתוך 5`}
                >
                  <span
                    className={`material-symbols-outlined text-3xl leading-none ${
                      star <= displayed ? 'text-warning-500' : 'text-on-surface/25'
                    }`}
                  >
                    star
                  </span>
                </button>
              ))}
            </div>
            {myRating?.verifiedInstall && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-success-50 px-3 py-1 text-xs font-bold text-success-700"
                title="התקנת התוסף אצלך נרשמה — הדירוג שלך מסומן כמאומת"
              >
                <span className="material-symbols-outlined text-sm leading-none">verified</span>
                <span>דירוג מאומת</span>
              </span>
            )}
            {myRating && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="text-sm font-medium text-danger-600 hover:underline disabled:opacity-50"
              >
                הסר דירוג
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'

// חלון קופץ לדיווח לבעל התוסף מתוך דף התוסף באתר.
// משתמש באותה נקודת קצה שמשמשת את תוכנת אוצריא (POST /api/plugin-reports).

type ReportType = 'bug' | 'crash' | 'content' | 'other'

const REPORT_TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'bug', label: 'תקלה' },
  { value: 'crash', label: 'קריסה' },
  { value: 'content', label: 'תוכן' },
  { value: 'other', label: 'אחר' },
]

const MAX_DETAILS_LENGTH = 5000

interface PluginReportModalProps {
  plugin: { id: string; pluginUid?: string | null; name: string; version: string }
  defaultEmail?: string | null
  onClose: () => void
  onSuccess: (duplicate: boolean) => void
}

function generateReportId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export default function PluginReportModal({ plugin, defaultEmail, onClose, onSuccess }: PluginReportModalProps) {
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [details, setDetails] = useState('')
  const [reporterEmail, setReporterEmail] = useState(defaultEmail || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = details.trim()
    if (!trimmed) {
      setError('נא לתאר את הבעיה')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/plugin-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: generateReportId(),
          pluginUid: plugin.pluginUid || plugin.id,
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          reportType,
          details: trimmed,
          reporterEmail: reporterEmail.trim() || undefined,
          platform: 'web',
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? 'נשלחו יותר מדי דיווחים. נסו שוב בעוד מספר דקות.'
            : result?.error || 'שגיאה בשליחת הדיווח'
        )
      }
      onSuccess(Boolean(result?.duplicate))
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'שגיאה בשליחת הדיווח')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-report-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white p-6">
          <h2 id="plugin-report-title" className="text-2xl font-bold text-on-surface">דיווח לבעל התוסף</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-on-surface/60 transition-colors hover:bg-neutral-100 hover:text-on-surface"
            aria-label="סגירה"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <p className="text-sm text-on-surface/70">
            הדיווח על <strong>{plugin.name}</strong> (גרסה {plugin.version}) יישלח במייל למפתח התוסף.
          </p>

          <div>
            <label className="mb-2 block text-sm font-bold text-on-surface/60">סוג הדיווח</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REPORT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setReportType(type.value)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    reportType === type.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-neutral-200 text-on-surface/70 hover:border-primary/30'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="plugin-report-details" className="mb-2 block text-sm font-bold text-on-surface/60">
              תיאור הבעיה <span className="text-danger-500">*</span>
            </label>
            <textarea
              id="plugin-report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS_LENGTH))}
              className="min-h-[150px] w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              placeholder="מה קרה, באיזה מצב, ומה הייתם מצפים שיקרה"
              required
              maxLength={MAX_DETAILS_LENGTH}
            />
            <p className="mt-1 text-xs text-on-surface/50">
              {details.length.toLocaleString('he-IL')} / {MAX_DETAILS_LENGTH.toLocaleString('he-IL')}
            </p>
          </div>

          <div>
            <label htmlFor="plugin-report-email" className="mb-2 block text-sm font-bold text-on-surface/60">
              כתובת מייל למענה (לא חובה)
            </label>
            <input
              id="plugin-report-email"
              type="email"
              value={reporterEmail}
              onChange={(e) => setReporterEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              placeholder="name@example.com"
              dir="ltr"
            />
            <p className="mt-1 text-xs text-on-surface/50">
              הכתובת תועבר למפתח התוסף כדי שיוכל לחזור אליכם. השאירו ריק כדי לדווח באופן אנונימי.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'שולח...' : 'שליחת הדיווח'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-neutral-200 px-6 py-3 font-bold text-on-surface transition-colors hover:bg-neutral-50"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

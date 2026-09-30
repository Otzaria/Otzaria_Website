'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import { formatDateShort, formatDateShortMonthWithYearAndTime } from '@/lib/formatDate'
import { MAX_ACTIVE, SCOPE_SHORT, STATE_LABELS } from '@/lib/pageProof/tokenRules'
import TokenCreateForm from './TokenCreateForm'
import TokenReveal from './TokenReveal'

// מפתחות-גישה לתוכנת-הספר (api/admin/page-proof/tokens): תוכנת-הספר של פרויקט ה-OCR קוראת
// הגשות, מאשרת/דוחה ומייבאת עמודים בלי דפדפן — רק בהגהת-העמודים, ורק כל עוד מי שיצר את
// המפתח הוא מנהל OCR. המפתח מוצג פעם אחת (TokenReveal); ברשימה — רק 8 התווים הראשונים.

const STATE_STYLE = {
  active: 'bg-success-50 text-success-800',
  revoked: 'bg-danger-50 text-danger-700',
  expired: 'bg-surface-variant/60 text-on-surface/70',
}

const failMsg = (d, fallback) => d?.error || fallback

// טקסט שעשוי להיות משמאל-לימין (שם באנגלית, ppt_…) בתוך משפט עברי — מבודד, כדי שהסוגריים
// וסימן-השאלה שסביבו לא יתהפכו (בהודעה אין JSX, ולכן לא <bdi>)
// (FSI…PDI — first-strong isolate; קודים ולא התווים עצמם, שלא ייראו כ"trojan source")
const FSI = String.fromCharCode(0x2068)
const PDI = String.fromCharCode(0x2069)
const isolate = (s) => `${FSI}${s}${PDI}`

export default function TokensCard() {
  const { showAlert, showConfirm } = useDialog()
  // {tokens, active, max} | null (נטען)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  // {token, name} — המפתח שנוצר עכשיו; רק בזיכרון של הדף, עד "הסתר"
  const [created, setCreated] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/page-proof/tokens', { cache: 'no-store' }).catch(() => null)
    const d = await res?.json().catch(() => null)
    if (res?.ok && d?.success) {
      setData(d)
      setLoadError(null)
    } else setLoadError(failMsg(d, 'טעינת המפתחות נכשלה'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async (input) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/page-proof/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success || !d.token) throw new Error(failMsg(d, 'יצירת המפתח נכשלה'))
      setCreated({ token: d.token, name: d.item?.name || input.name })
      await load()
      return true
    } catch (e) {
      showAlert('שגיאה', e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const revoke = (t) =>
    showConfirm(
      'ביטול מפתח-גישה',
      `לבטל את "${isolate(t.name)}" (${isolate(`${t.prefix}…`)})? תוכנת-הספר שמשתמשת בו תפסיק לעבוד מיד, ואי-אפשר להחזיר אותו — רק ליצור מפתח חדש.`,
      async () => {
        const res = await fetch(`/api/admin/page-proof/tokens/${t.id}`, { method: 'DELETE' }).catch(() => null)
        const d = await res?.json().catch(() => null)
        if (!res?.ok || !d?.success) showAlert('שגיאה', failMsg(d, 'הביטול נכשל'))
        await load()
      },
      'בטל את המפתח',
      'חזרה'
    )

  const tokens = data?.tokens || []
  const max = data?.max || MAX_ACTIVE
  const full = (data?.active || 0) >= max

  return (
    <div className="glass-strong rounded-xl p-4" data-testid="tokens-card">
      <h3 className="mb-2 flex items-center gap-2 font-bold text-on-surface">
        <span className="material-symbols-outlined text-primary">key</span>
        מפתחות-גישה לתוכנת-הספר
      </h3>
      <p className="mb-3 text-sm text-on-surface/60">
        מפתח-גישה מאפשר לתוכנת-הספר של פרויקט ה-OCR לעבוד מול הגהת-העמודים בלי דפדפן: לקרוא ספרים והגשות, לאשר ולדחות, ולייבא עמודים
        (לפי ההרשאות שתבחרו) — בשמכם, ורק כאן: לא מחיקת ספרים, לא ניהול מפתחות ולא שום אזור אחר באתר. המפתח פועל רק כל עוד אתם מנהלי OCR,
        עד תום התוקף או עד שתבטלו אותו (הביטול חל מיד). עד {max} מפתחות פעילים.
      </p>

      {created ? (
        <TokenReveal token={created.token} name={created.name} onDone={() => setCreated(null)} />
      ) : (
        <>
          <TokenCreateForm busy={busy} disabled={full || !data} onCreate={create} />
          {full && <p className="mt-2 text-xs text-warning-800">יש כבר {max} מפתחות פעילים — בטלו מפתח שאינו בשימוש כדי ליצור חדש.</p>}
        </>
      )}

      {loadError && <p className="mt-3 rounded bg-danger-50 px-2 py-1 text-sm text-danger-700">{loadError}</p>}
      {data && (
        <div className="mt-4">
          <p className="mb-1 text-xs text-on-surface/60">
            {data.active} מתוך {max} פעילים
          </p>
          {!tokens.length ? (
            <p className="py-2 text-center text-sm text-on-surface/60">אין מפתחות</p>
          ) : (
            <table className="w-full text-sm" data-testid="tokens-table">
              <thead className="text-right text-on-surface/60">
                <tr>
                  <th className="p-1">מפתח</th>
                  <th className="p-1">שם</th>
                  <th className="p-1">הרשאות</th>
                  <th className="p-1">נוצר</th>
                  <th className="p-1">שימוש אחרון</th>
                  <th className="p-1">בתוקף עד</th>
                  <th className="p-1">מצב</th>
                  <th className="p-1"></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className="border-t border-surface-variant">
                    <td className="p-1">
                      <code dir="ltr" className="font-mono text-xs">
                        {t.prefix}…
                      </code>
                    </td>
                    <td className="p-1">{t.name}</td>
                    <td className="p-1 text-xs">{t.scopes.map((s) => SCOPE_SHORT[s] || s).join(' · ')}</td>
                    <td className="p-1 text-xs">{t.createdAt ? formatDateShort(t.createdAt) : ''}</td>
                    <td className="p-1 text-xs">{t.lastUsedAt ? formatDateShortMonthWithYearAndTime(t.lastUsedAt) : 'לא נעשה שימוש'}</td>
                    <td className="p-1 text-xs">{t.expiresAt ? formatDateShort(t.expiresAt) : ''}</td>
                    <td className="p-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATE_STYLE[t.state] || ''}`}>{STATE_LABELS[t.state] || t.state}</span>
                    </td>
                    <td className="p-1">
                      {t.state === 'active' && (
                        <button
                          type="button"
                          onClick={() => revoke(t)}
                          className="flex items-center gap-1 rounded-md bg-danger-600 px-2 py-1 text-xs text-white hover:bg-danger-700"
                          aria-label={`ביטול המפתח ${t.name}`}
                        >
                          <span className="material-symbols-outlined text-sm">block</span>
                          ביטול
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

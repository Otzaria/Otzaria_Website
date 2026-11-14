'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ErrorState from '@/components/ui/ErrorState'
import Ltr from '@/components/ui/Ltr'
import MenuButton from '@/components/ui/MenuButton'
import Notice from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import RelativeTime from '@/components/ui/RelativeTime'
import { formatNumber } from '@/lib/adminTerms'
import { formatDateShort } from '@/lib/formatDate'
import { errorToast } from '@/components/admin/list/adminRequest'
import { API, apiCall } from './adminApi'
import { MAX_ACTIVE, SCOPE_SHORT } from './tokenLabels'
import TokenCreateForm from './TokenCreateForm'
import TokenReveal from './TokenReveal'
import EmptyText from '@/components/ui/EmptyText'
import ListLoading from '@/components/ui/ListLoading'
import CardSection from '@/components/ui/CardSection'
import { StatusBadge } from './TzuratBits'

// לשונית "מפתחות גישה" (לשעבר "מפתחות API"; קידומת tht_; api/admin/tzurat-hadaf/tokens): הכלים של צורת הדף
// (tools/site_pull.py ועוד) קוראים, מכריעים ומעלים בלי דפדפן — רק תחת /api/admin/tzurat-hadaf, ורק כל עוד מי שיצר
// את המפתח מנהל את צורת הדף. המפתח מוצג פעם אחת. אותן בקשות כמו קודם: GET / POST {name, days, scopes} / DELETE [id].
// "בטל את המפתח" — בתפריט ⋮ של השורה, באדום, עם אישור (אי אפשר להחזיר). השורה נשארת עם התג "בוטל" (עדכון מקומי,
// בלי טעינה מחדש), והפוקוס עובר לכותרת "המפתחות" (ה-⋮ של השורה נעלם). הבקשות דרך apiCall (send המשותף).
// onDirty(true) כל עוד מפתח חדש מוצג — המעטפת מזהירה לפני מעבר לשונית או יציאה (אחרי זה אי אפשר לראות אותו שוב).

export const TOKENS_API = `${API}/tokens`

function TokenRow({ t, onRevoke, busy }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0" data-testid="token-row">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-title-sm text-on-surface"><bdi>{t.name}</bdi></h3>
          <StatusBadge kind="token" status={t.state} />
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-body-sm text-on-surface-variant">
          <Ltr className="font-mono">{t.prefix}…</Ltr>
          <span>{(t.scopes || []).map((s) => SCOPE_SHORT[s] || s).join(' · ')}</span>
          {t.createdAt && <RelativeTime date={t.createdAt} prefix="נוצר" />}
          {t.lastUsedAt ? <RelativeTime date={t.lastUsedAt} prefix="שימוש אחרון" /> : <span>לא נעשה בו שימוש</span>}
          {t.expiresAt && <span>בתוקף עד {formatDateShort(t.expiresAt)}</span>}
        </p>
      </div>
      {t.state === 'active' && (
        <MenuButton label={`עוד פעולות למפתח ${t.name}`} items={[{ id: 'revoke', icon: 'block', label: 'בטל את המפתח', danger: true, disabled: busy, onSelect: () => onRevoke(t) }]} />
      )}
    </li>
  )
}

/** @param {{ onDirty?: (dirty: boolean) => void }} props */
export default function TokensCard({ onDirty }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [data, setData] = useState(null) // {tokens, active, max}
  const [loadError, setLoadError] = useState(null)
  const [created, setCreated] = useState(null) // {token, name}
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState(null) // מזהה המפתח שהביטול שלו בדרך
  const [focusForm, setFocusForm] = useState(false) // אחרי "הסתר" — הפוקוס לשדה השם
  const listHeading = useRef(null)

  const [tick, setTick] = useState(0)
  const load = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let on = true
    apiCall(TOKENS_API).then((r) => {
      if (!on) return
      if (r.ok && r.data?.success !== false) {
        setData(r.data)
        setLoadError(null)
      } else setLoadError(r.error || 'טעינת המפתחות נכשלה')
    })
    return () => {
      on = false
    }
  }, [tick])

  useEffect(() => {
    onDirty?.(!!created)
  }, [created, onDirty])

  const create = async (input) => {
    if (busy) return false
    setBusy(true)
    const r = await apiCall(TOKENS_API, { method: 'POST', body: input })
    setBusy(false)
    const d = r.data
    if (!r.ok || d?.success === false || !d?.token) {
      toast.show(errorToast({ message: r.ok ? 'יצירת המפתח נכשלה' : r.error, sessionExpired: r.sessionExpired }, 'יצירת המפתח נכשלה'))
      return false
    }
    setFocusForm(false)
    setCreated({ token: d.token, name: d.item?.name || input.name })
    // השורה החדשה נוספת מקומית (בלי טעינה מחדש); בלי item בתשובה — טוענים
    if (d.item) setData((cur) => (cur ? { ...cur, tokens: [d.item, ...(cur.tokens || [])], active: (cur.active ?? 0) + 1 } : cur))
    else load()
    return true
  }

  const hideCreated = () => {
    setCreated(null)
    setFocusForm(true)
  }

  const revoke = async (t) => {
    const ok = await confirm({
      title: 'לבטל את המפתח?',
      body: <>כלי שמשתמש במפתח &quot;<bdi>{t.name}</bdi>&quot; (<Ltr className="font-mono">{t.prefix}…</Ltr>) יפסיק לעבוד מיד. אי אפשר להחזיר אותו — רק ליצור מפתח חדש.</>,
      confirmLabel: 'בטל את המפתח',
      cancelLabel: 'חזרה',
      tone: 'danger',
    })
    if (!ok || revoking) return
    setRevoking(t.id)
    const r = await apiCall(`${TOKENS_API}/${encodeURIComponent(t.id)}`, { method: 'DELETE' })
    setRevoking(null)
    if (!r.ok || r.data?.success === false) {
      toast.show(errorToast({ message: r.error || 'הביטול נכשל', sessionExpired: r.sessionExpired }, 'הביטול נכשל'))
      return
    }
    // השורה נשארת במקומה עם "בוטל" — מיד, כדי שאי אפשר יהיה לבטל שוב
    const next = { ...t, ...(r.data?.item || {}), state: r.data?.item?.state || 'revoked' }
    setData((cur) => (cur ? {
      ...cur,
      tokens: (cur.tokens || []).map((x) => (x.id === t.id ? next : x)),
      active: Math.max(0, (cur.active ?? 0) - (t.state === 'active' && next.state !== 'active' ? 1 : 0)),
    } : cur))
    toast.show({ message: `המפתח "${t.name}" בוטל` })
    requestAnimationFrame(() => listHeading.current?.focus())
  }

  if (loadError && !data) return <ErrorState title="לא הצלחנו לטעון את מפתחות הגישה" description={loadError} onRetry={load} />

  const tokens = data?.tokens || []
  const max = data?.max || MAX_ACTIVE
  const active = data?.active ?? tokens.filter((t) => t.state === 'active').length
  const full = active >= max

  return (
    <div className="flex flex-col gap-4" data-testid="tokens-card">
      <CardSection
        title="מפתח גישה חדש"
        description={(
          <>
            מפתח גישה מאפשר לכלים של צורת הדף לעבוד מול האתר בלי דפדפן: לקרוא, לייצא, להכריע ולאשר, ולהעלות חבילות — לפי
            ההרשאות שתבחר, בשמך, ורק בצורת הדף. הוא פועל כל עוד אתה מנהל את צורת הדף, עד שפג תוקפו או עד שתבטל אותו. עד{' '}
            {formatNumber(max)} מפתחות פעילים.
          </>
        )}
      >
        {created ? (
          <TokenReveal token={created.token} name={created.name} onDone={hideCreated} />
        ) : (
          <>
            <TokenCreateForm busy={busy} disabled={full} onCreate={create} autoFocus={focusForm} />
            {full && <Notice tone="info">יש כבר {formatNumber(max)} מפתחות פעילים — בטל מפתח שאינו בשימוש כדי ליצור חדש.</Notice>}
          </>
        )}
      </CardSection>

      <CardSection title="המפתחות" headingRef={listHeading} description={data ? `${formatNumber(active)} מתוך ${formatNumber(max)} פעילים` : null}>
        {loadError && <Notice tone="error" role="alert">{loadError}</Notice>}
        {!data ? <ListLoading rows={2} /> : !tokens.length ? (
          <EmptyText>עוד לא נוצרו מפתחות</EmptyText>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant" data-testid="tokens-table">
            {tokens.map((t) => <TokenRow key={t.id} t={t} onRevoke={revoke} busy={revoking === t.id} />)}
          </ul>
        )}
      </CardSection>
      {confirmElement}
    </div>
  )
}

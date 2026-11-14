'use client'

import { useCallback, useEffect, useState } from 'react'
import MenuButton from '@/components/ui/MenuButton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useAsk } from '../useAsk'
import { getJson, sendJson, fmt, fmtDate } from '../api'
import Button from '@/components/ui/Button'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'
import { fieldClasses, FIELD_LABEL_COMPACT } from '@/components/ui/fieldStyles'
import { Card, Empty, Muted, Tag } from '../bits'
import { TD, TH } from '../proofStyles'
import { matchTone } from '../review/VolunteerPicker'
import { SECTIONS, SECTION_LABELS } from '@/lib/trainingProof/vocab'
import CorrectionsDialog from './CorrectionsDialog'

// לשונית "מתנדבים" (docs/75 ה-1, ה-17): בקשות ממתינות (אישור/דחייה), מגיהים עם גישה
// (מונים, שיעור-התאמה, ביטול גישה שמחזיר למאגר את מה שתפסו), והוספה ישירה של משתמש רשום.

const STATUS = { denied: 'נדחתה', revoked: 'הגישה בוטלה' }

// "תיקנת": כמה סימונים של המתנדב המנהל אישר אחרי תיקון, לפי חלק (רק חלקים שיש בהם)
export function correctedText(stats) {
  if (!stats?.corrected) return '0'
  return SECTIONS.filter((s) => stats.bySection?.[s]?.corrected)
    .map((s) => `${SECTION_LABELS[s]} ${fmt(stats.bySection[s].corrected)}`)
    .join(' · ')
}

export default function VolunteersTab({ onChanged }) {
  const { showAlert } = useAsk()
  const [confirm, confirmElement] = useConfirm()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [show, setShow] = useState(null) // "הצג תיקונים" — המתנדב שהיומן שלו פתוח
  const load = useCallback(async () => {
    try {
      setData(await getJson('/volunteers'))
    } catch (e) {
      setData({ requests: [], approved: [], others: [], error: e.message })
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    load()
  }, [load])

  const run = async (fn, done) => {
    setBusy(true)
    try {
      const r = await fn()
      if (done) showAlert('בוצע', done(r))
      await load()
      onChanged?.()
      return true
    } catch (e) {
      showAlert('שגיאה', e.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const decide = (u, action, done) => run(() => sendJson(`/volunteers/${u.userId}`, { action }), done)
  const revoke = async (v) => {
    const yes = await confirm({
      title: `להסיר את ${v.name || 'המגיה'} מהצוות?`,
      body: 'הוא לא יוכל להמשיך להגיה. ההגשות שלו שעוד ממתינות נשארות לאישור שלך, ומה שהוא עובד עליו עכשיו חוזר להיות פנוי.',
      confirmLabel: 'הסר מהצוות',
      tone: 'danger',
    })
    if (yes) decide(v, 'revoke', (r) => `הוסר מהצוות. משימות שחזרו להיות פנויות: ${fmt(r.released?.items)}${r.released?.books ? `, ${fmt(r.released.books)} ספרים` : ''}.`)
  }
  const add = (e) => {
    e.preventDefault()
    if (!q.trim() || busy) return
    run(() => sendJson('/volunteers', { query: q.trim() }), (r) => `${r.name || r.email} קיבל גישה`).then((ok) => ok && setQ(''))
  }

  if (!data) return <ListLoading rows={3} label="טוען את המתנדבים…" />
  return (
    <div className="flex flex-col gap-4">
      <ErrorNotice text={data.error} />
      <Card title="בקשות גישה" icon="person_add">
        {!data.requests.length ? (
          <Empty>אין בקשות ממתינות</Empty>
        ) : (
          <ul aria-label="בקשות גישה" className="flex flex-col">
            {data.requests.map((r) => (
              <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <span className="text-label-lg text-on-surface">{r.name || '—'}</span>{' '}
                  <span className="text-body-sm text-on-surface-variant">{r.email} · {fmtDate(r.requestedAt)}</span>
                  <p className="text-body-md text-on-surface">{r.message || <span className="text-on-surface-variant">לא כתב כלום</span>}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="tonal" size="sm" icon="check" softDisabled={busy} onClick={() => decide(r, 'approve', () => `${r.name} קיבל גישה`)}>
                    אשר
                  </Button>
                  <Button variant="text" size="sm" softDisabled={busy} onClick={() => decide(r, 'deny', () => 'הבקשה נדחתה')} className="text-error">
                    דחה
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="מגיהים" icon="group">
        <Muted>
          &quot;התאמה&quot; — כמה מההגשות שלו אושרו בלי שינוי (מתוך כל מה שנסקר — אושר או נדחה). עוזר להחליט על מי לסמוך באישור גורף.
          &quot;תיקנת&quot; — כמה מהסימונים שלו אישרת אחרי &quot;תקן ואשר&quot;, לפי חלק — נשמר גם אחרי ההורדה.
        </Muted>
        {!data.approved.length ? (
          <Empty>אין עדיין מגיהים</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-3xl text-body-md">
              <caption className="sr-only">המגיהים</caption>
              <thead className="border-b border-outline-variant">
                <tr>
                  <th scope="col" className={TH}>שם</th>
                  <th scope="col" className={TH}>מאז</th>
                  <th scope="col" className={TH}>שורות</th>
                  <th scope="col" className={TH}>עמודי גלאי</th>
                  <th scope="col" className={TH}>ממתינות</th>
                  <th scope="col" className={TH}>התאמה</th>
                  <th scope="col" className={TH}>תיקנת</th>
                  <th scope="col" className={TH}>פעיל לאחרונה</th>
                  <th scope="col" className={TH}><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody>
                {data.approved.map((v) => (
                  <tr key={v.userId} className="border-b border-outline-variant last:border-0">
                    <td className={`${TD} max-w-64 [overflow-wrap:anywhere]`}>
                      <span className="text-label-lg text-on-surface">{v.name || '—'}</span>
                      <div className="text-body-sm text-on-surface-variant">{v.email}</div>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-body-sm`}>{fmtDate(v.since)}</td>
                    <td className={`${TD} tabular-nums`}>{fmt(v.stats?.lines)}</td>
                    <td className={`${TD} tabular-nums`}>{fmt(v.stats?.pages)}</td>
                    <td className={`${TD} tabular-nums`}>{fmt(v.stats?.pending)}</td>
                    <td className={TD}>
                      <Tag tone={matchTone(v.stats?.match)}>{v.stats?.match == null ? '—' : `${v.stats.match}%`}</Tag>
                    </td>
                    <td className={TD} data-testid={`corrected-${v.userId}`}>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-body-sm">{correctedText(v.stats)}</span>
                        {v.stats?.corrected > 0 && (
                          <Button variant="text" size="sm" onClick={() => setShow(v)} className="-ms-3 whitespace-nowrap">
                            הצג תיקונים
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-body-sm`}>{fmtDate(v.last)}</td>
                    <td className={`${TD} w-px text-end`}>
                      <MenuButton
                        label={`עוד פעולות: ${v.name || v.email}`}
                        items={[{ id: 'revoke', icon: 'block', label: 'הסר מהצוות', danger: true, disabled: busy, onSelect: () => revoke(v) }]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={add} className="flex flex-col gap-2 border-t border-outline-variant pt-4">
          <label htmlFor="tp-add-user" className={FIELD_LABEL_COMPACT}>
            הוספה ישירה (משתמש רשום באתר)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="tp-add-user"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="אימייל או שם-משתמש"
              className={fieldClasses({ className: 'min-w-0 flex-1 basis-64 sm:max-w-sm' })}
            />
            <Button type="submit" variant="tonal" size="sm" icon="person_add" softDisabled={busy || !q.trim()}>
              תן גישה
            </Button>
          </div>
        </form>
      </Card>

      {show && <CorrectionsDialog vol={show} onClose={() => setShow(null)} />}
      {confirmElement}

      {data.others.length > 0 && (
        <Card title="בקשות שנדחו וגישות שבוטלו" icon="block">
          <ul aria-label="בקשות שנדחו וגישות שבוטלו" className="flex flex-col">
            {data.others.map((o) => (
              <li key={o.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant py-2 last:border-0">
                <span className="min-w-0">
                  <span className="text-label-lg text-on-surface">{o.name || '—'}</span>{' '}
                  <span className="text-body-sm text-on-surface-variant">{o.email} · {STATUS[o.status]} {fmtDate(o.decidedAt)}</span>
                </span>
                <Button variant="text" size="sm" softDisabled={busy} onClick={() => decide(o, 'approve', () => `${o.name} קיבל גישה`)}>
                  תן גישה
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

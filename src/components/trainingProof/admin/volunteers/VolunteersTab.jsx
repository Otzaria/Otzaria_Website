'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAsk } from '../useAsk'
import { getJson, sendJson, fmt, fmtDate } from '../api'
import { BTN, Card, Empty, Tag } from '../bits'
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
  const { showAlert, ask } = useAsk()
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
    const yes = await ask(
      `לבטל את הגישה של ${v.name}?`,
      'ההגשות שלו שעוד ממתינות נשארות לסקירה שלכם. השורות שתפס, וספר-גלאי שבידיו, חוזרים למאגר.',
      'בטל גישה'
    )
    if (yes) decide(v, 'revoke', (r) => `הגישה בוטלה. חזרו למאגר: ${fmt(r.released?.items)} פריטים${r.released?.books ? `, ${fmt(r.released.books)} ספרים` : ''}.`)
  }
  const add = (e) => {
    e.preventDefault()
    if (!q.trim()) return
    run(() => sendJson('/volunteers', { query: q.trim() }), (r) => `${r.name || r.email} קיבל גישה`).then((ok) => ok && setQ(''))
  }

  if (!data) return <Empty>טוען…</Empty>
  return (
    <div className="flex flex-col gap-4">
      {data.error && <Empty>{data.error}</Empty>}
      <Card title="בקשות גישה ממתינות" icon="person_add">
        {!data.requests.length ? (
          <Empty>אין בקשות ממתינות</Empty>
        ) : (
          data.requests.map((r) => (
            <div key={r.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-variant py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <b>{r.name || '—'}</b> <span className="text-sm text-on-surface/60">{r.email} · {fmtDate(r.requestedAt)}</span>
                <div className="text-sm">{r.message || <span className="text-on-surface/50">לא כתב כלום</span>}</div>
              </div>
              <div className="flex gap-1">
                <button className={BTN.primary} disabled={busy} onClick={() => decide(r, 'approve', () => `${r.name} קיבל גישה`)}>
                  <span className="material-symbols-outlined text-sm">check</span> אשר גישה
                </button>
                <button className={BTN.outline} disabled={busy} onClick={() => decide(r, 'deny', () => 'הבקשה נדחתה')}>
                  דחה
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title="מגיהים עם גישה" icon="group">
        <p className="text-sm text-on-surface/60">
          "התאמה" = כמה מההגשות שלו אושרו בלי שינוי (מתוך כל מה שנסקר — אושר או נדחה). עוזר להחליט על מי לסמוך באישור גורף. "תיקנת" =
          כמה מהסימונים שלו אישרת אחרי "תקן ואשר", לפי חלק — נשמר גם אחרי ההורדה לתחנה.
        </p>
        {!data.approved.length ? (
          <Empty>אין עדיין מגיהים</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-variant/50 text-right">
                <tr>
                  <th className="p-2">שם</th>
                  <th className="p-2">מאז</th>
                  <th className="p-2">שורות</th>
                  <th className="p-2">עמודי גלאי</th>
                  <th className="p-2">ממתינות</th>
                  <th className="p-2">התאמה</th>
                  <th className="p-2">תיקנת</th>
                  <th className="p-2">פעיל לאחרונה</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {data.approved.map((v) => (
                  <tr key={v.userId} className="border-t border-surface-variant">
                    <td className="p-2">
                      <b>{v.name || '—'}</b>
                      <div className="text-xs text-on-surface/50">{v.email}</div>
                    </td>
                    <td className="p-2 text-xs">{fmtDate(v.since)}</td>
                    <td className="p-2 tabular-nums">{fmt(v.stats?.lines)}</td>
                    <td className="p-2 tabular-nums">{fmt(v.stats?.pages)}</td>
                    <td className="p-2 tabular-nums">{fmt(v.stats?.pending)}</td>
                    <td className="p-2">
                      <Tag tone={matchTone(v.stats?.match)}>{v.stats?.match == null ? '—' : `${v.stats.match}%`}</Tag>
                    </td>
                    <td className="p-2" data-testid={`corrected-${v.userId}`}>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-xs">{correctedText(v.stats)}</span>
                        {v.stats?.corrected > 0 && (
                          <button className="text-xs text-info-700 hover:underline" onClick={() => setShow(v)}>
                            הצג תיקונים
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-xs">{fmtDate(v.last)}</td>
                    <td className="p-2">
                      <button className={BTN.danger} disabled={busy} onClick={() => revoke(v)}>
                        בטל גישה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-t border-surface-variant pt-3">
          <label htmlFor="tp-add-user" className="text-sm">
            הוספה ישירה (משתמש רשום באתר)
          </label>
          <input
            id="tp-add-user"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="אימייל או שם-משתמש"
            className="min-w-56 rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
          />
          <button type="submit" className={BTN.outline} disabled={busy || !q.trim()}>
            תן גישה
          </button>
        </form>
      </Card>

      {show && <CorrectionsDialog vol={show} onClose={() => setShow(null)} />}

      {data.others.length > 0 && (
        <Card title="בקשות שנדחו וגישות שבוטלו" icon="block">
          {data.others.map((o) => (
            <div key={o.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-variant py-1.5 text-sm last:border-0">
              <span>
                <b>{o.name || '—'}</b> <span className="text-on-surface/60">{o.email} · {STATUS[o.status]} {fmtDate(o.decidedAt)}</span>
              </span>
              <button className={BTN.outline} disabled={busy} onClick={() => decide(o, 'approve', () => `${o.name} קיבל גישה`)}>
                תן גישה
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

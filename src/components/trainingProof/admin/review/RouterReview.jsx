'use client'

import { useState } from 'react'
import { LINE_SCRIPTS, SCRIPT_LABELS } from '@/lib/trainingProof/vocab'
import { fmt } from '../api'
import { BTN, Empty, Muted } from '../bits'
import { useReview } from './useReview'
import { BulkBar, Pager } from './BulkBar'
import RouterRow from './RouterRow'
import VolunteerPicker from './VolunteerPicker'
import { useHandles, useRowKeys } from './rowKeys'
import KeyHint, { Kbd } from './KeyHint'

const select = 'rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm'

// סקירת נתב-הכתב. כל סימון נכנס לשלושת הנתבים (שורה · מילה · רצועה), ולכן אין כאן
// "מסלול" מהקובץ — המסנן הוא מה שהמתנדב סימן, והאם הסכים עם הנתב.
export default function RouterReview({ onChanged }) {
  const [f, setF] = useState({ status: 'submitted', track: '', agree: '', vol: '' })
  const [picker, setPicker] = useState(false)
  const query = { section: 'router', status: f.status, track: f.track || null, agree: f.agree || null, vol: f.vol || null }
  const R = useReview(query, onChanged)
  const items = R.data?.items || []
  const stats = R.data?.stats
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const H = useHandles()
  // 1–4 כתב-השורה (תיקון) · 0 פסול · Enter אשר (עם התיקון, אם יש) · Delete דחה
  const K = useRowKeys(items, (key, it) => {
    if (it.status !== 'submitted' || R.busy) return false
    const h = H.get(it.id)
    if (/^[1-4]$/.test(key)) h?.setLabel(LINE_SCRIPTS[+key - 1])
    else if (key === '0') h?.setLabel('bad')
    else if (key === 'Enter') h?.confirm()
    else if (key === 'Delete') R.decide([it.id], 'reject')
    else return false
    return true
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="glass-strong flex flex-col gap-2 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5">
            מצב
            <select className={select} value={f.status} onChange={set('status')}>
              <option value="submitted">ממתינות לאישור</option>
              <option value="approved">אושרו (עוד לא הורדו)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            המתנדב סימן
            <select className={select} value={f.track} onChange={set('track')}>
              <option value="">הכול</option>
              {LINE_SCRIPTS.map((s) => (
                <option key={s} value={s}>
                  {SCRIPT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {f.status === 'submitted' && (
            <label className="flex items-center gap-1.5">
              מול הנתב
              <select className={select} value={f.agree} onChange={set('agree')}>
                <option value="">הכול</option>
                <option value="1">הסכים עם ההצעה</option>
                <option value="0">שונה מההצעה</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            מתנדב
            <select className={select} value={f.vol} onChange={set('vol')}>
              <option value="">כולם</option>
              {(stats?.vols || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Muted>כל סימון נכנס לשלושת הנתבים: כתב-השורה לנתב-השורה, הכתב של כל מילה לנתב-המילה ולנתב-הרצועה.</Muted>
      </div>

      {f.status === 'submitted' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-on-surface/60">אישור מהיר:</span>
          <button
            className={BTN.tonal}
            disabled={R.busy || !stats?.agree}
            onClick={() =>
              R.bulk('router-agree', {}, {
                title: (n) => `לאשר ${fmt(n)} שורות שהמתנדב הסכים בהן עם הנתב?`,
                message: 'בכל התור (לא רק במסך): כתב-השורה זהה להצעת הנתב, ובשורה מעורבת — גם הכתב של כל מילה.',
              })
            }
          >
            אשר את כל מה שהמתנדב הסכים בו עם הנתב ({fmt(stats?.agree)})
          </button>
          <button className={BTN.tonal} disabled={R.busy || !stats?.vols?.length} onClick={() => setPicker(true)}>
            הכול ממתנדב מסוים…
          </button>
        </div>
      )}

      <KeyHint>
        <Kbd>1</Kbd> מרובע · <Kbd>2</Kbd> רש&quot;י · <Kbd>3</Kbd> לועזית · <Kbd>4</Kbd> מעורבת · <Kbd>0</Kbd> פסול (אלה תיקון) · <Kbd>Enter</Kbd> אשר
        (עם התיקון, אם יש) · <Kbd>Delete</Kbd> דחה · <Kbd>↓</Kbd>/<Kbd>↑</Kbd> שורה אחרת
      </KeyHint>

      <BulkBar
        items={items}
        sel={R.sel}
        setSel={R.setSel}
        busy={R.busy}
        total={R.data?.total || 0}
        onApprove={() => R.decideSelected('approve')}
        onReject={() => R.decideSelected('reject')}
      />

      <div className="glass-strong overflow-hidden rounded-xl" aria-busy={!R.data}>
        {R.data?.error && <Empty>{R.data.error}</Empty>}
        {R.data && !items.length && !R.data.error && <Empty>אין שורות בתצוגה הזו</Empty>}
        {!R.data && <Empty>טוען…</Empty>}
        {items.map((it, i) => (
          <RouterRow
            key={`${it.id}-${it.status}-${it.adminFixed}`}
            item={it}
            current={i === K.cur}
            onPick={() => K.setCur(i)}
            handle={H.ref(it.id)}
            busy={R.busy}
            selected={R.sel.has(it.id)}
            onToggle={R.toggle}
            onApprove={(x) => R.decide([x.id], 'approve')}
            onReject={(x) => R.decide([x.id], 'reject')}
            onUnapprove={(x) => R.decide([x.id], 'unapprove')}
            onFix={(x, mark) => R.fix(x, mark)}
          />
        ))}
      </div>
      <Pager data={R.data} setPage={R.setPage} />

      {picker && (
        <VolunteerPicker
          vols={stats?.vols || []}
          onClose={() => setPicker(false)}
          onPick={(v) => {
            setPicker(false)
            R.bulk('volunteer', { vol: v.id }, {
              title: (n) => `לאשר ${fmt(n)} שורות של ${v.name}?`,
              message: `כל ההגשות הממתינות של ${v.name} בנתב-הכתב.${v.match != null ? ` שיעור-ההתאמה שלו עד היום: ${v.match}%.` : ''}`,
            })
          }}
        />
      )}
    </div>
  )
}

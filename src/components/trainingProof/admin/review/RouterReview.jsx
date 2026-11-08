'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { LINE_SCRIPTS, SCRIPT_LABELS } from '@/lib/trainingProof/vocab'
import { fmt } from '../api'
import { Muted } from '../bits'
import { useReview } from './useReview'
import { BulkBar, Pager } from './BulkBar'
import RouterRow from './RouterRow'
import VolunteerPicker from './VolunteerPicker'
import ReviewFilters from './ReviewFilters'
import ReviewList, { QuickApprove } from './ReviewList'
import { STATUS_OPTIONS, clearedKeepStatus, emptyView } from './filterState'
import { useHandles, useRowKeys } from './rowKeys'
import KeyHint, { Kbd } from './KeyHint'

const AGREE_OPTIONS = [
  { value: '1', label: 'הסכים עם ההצעה' },
  { value: '0', label: 'שונה מההצעה' },
]

// סקירת נתב-הכתב. כל סימון נכנס לשלושת הנתבים (שורה · מילה · רצועה), ולכן אין כאן
// "מסלול" מהקובץ — המסנן הוא מה שהמתנדב סימן, והאם הסכים עם הנתב.
export default function RouterReview({ onChanged }) {
  const [f, setF] = useState({ status: 'submitted', track: '', agree: '', vol: '' })
  const [picker, setPicker] = useState(false)
  const query = { section: 'router', status: f.status, track: f.track || null, agree: f.agree || null, vol: f.vol || null }
  const R = useReview(query, onChanged)
  const items = R.data?.items || []
  const stats = R.data?.stats
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

  // "מול הנתב" — רק בממתינות (במאושרות אין לו משמעות)
  const defs = [
    { key: 'status', label: 'מצב', options: STATUS_OPTIONS, empty: 'submitted' },
    { key: 'track', label: 'המתנדב סימן', allLabel: 'הכול', options: LINE_SCRIPTS.map((s) => ({ value: s, label: SCRIPT_LABELS[s] })) },
    ...(f.status === 'submitted' ? [{ key: 'agree', label: 'מול הנתב', allLabel: 'הכול', options: AGREE_OPTIONS }] : []),
    { key: 'vol', label: 'מתנדב', allLabel: 'כולם', options: (stats?.vols || []).map((v) => ({ value: v.id, label: v.name })) },
  ]
  // מעבר ל"אושרו" מנקה את "מול הנתב" (הבורר נעלם, והסינון לא יישאר מוסתר)
  const onFilters = (next) => setF(next.status === 'submitted' ? next : { ...next, agree: '' })

  return (
    <div className="flex flex-col gap-4">
      <ReviewFilters filters={f} defs={defs} onChange={onFilters} />
      <Muted>כל סימון נכנס לשלושת הנתבים: כתב-השורה לנתב-השורה, הכתב של כל מילה לנתב-המילה ולנתב-הרצועה.</Muted>

      {f.status === 'submitted' && (
        <QuickApprove>
          <Button
            variant="tonal"
            size="sm"
            icon="done_all"
            disabled={R.busy || !stats?.agree}
            onClick={() =>
              R.bulk('router-agree', {}, {
                title: (n) => `לאשר ${fmt(n)} שורות שהמתנדב הסכים בהן עם הנתב?`,
                message: 'בכל התור (לא רק במסך): כתב-השורה זהה להצעת הנתב, ובשורה מעורבת — גם הכתב של כל מילה.',
              })
            }
          >
            כל מה שהמתנדב הסכים בו עם הנתב ({fmt(stats?.agree)})
          </Button>
          <Button variant="text" size="sm" icon="person" disabled={R.busy || !stats?.vols?.length} onClick={() => setPicker(true)}>
            הכול ממתנדב מסוים…
          </Button>
        </QuickApprove>
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

      <ReviewList data={R.data} count={items.length} empty={emptyView(f, defs)} onClear={() => setF(clearedKeepStatus(f, defs))}>
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
      </ReviewList>
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

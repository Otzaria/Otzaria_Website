'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import CheckRow from '@/components/ui/CheckRow'
import { LINE_SCRIPTS, SCRIPT_LABELS, OCR_RETURN_ACTIONS } from '@/lib/trainingProof/vocab'
import { fmt } from '../api'
import { Muted } from '../bits'
import { useReview } from './useReview'
import { BulkBar, Pager } from './BulkBar'
import OcrRow, { ADMIN_MARKS } from './OcrRow'
import VolunteerPicker from './VolunteerPicker'
import ReviewFilters from './ReviewFilters'
import ReviewList, { QuickApprove } from './ReviewList'
import { STATUS_OPTIONS, clearedKeepStatus, emptyView } from './filterState'
import { useHandles, useRowKeys } from './rowKeys'
import KeyHint, { Kbd } from './KeyHint'

const MARK_KEYS = Object.fromEntries(ADMIN_MARKS.map((m) => [m.key, m.action]))
const ACTION_FILTER = { ok: 'סימן: נכון', fixed: 'תיקן', seg: 'חיתוך גרוע', bad: 'לא קריא', router: 'הכתב שגוי' }

// סקירת זיהוי-הטקסט: מסננים (מצב, מסלול, מה המתנדב עשה, מתנדב; ביטחון נמוך קודם),
// השוואה מודל↔מתנדב, אישור בודד / "תקן ואשר" / דחייה, סימון ואישור/דחייה גורפים,
// ואישור מהיר על כל התור.
export default function OcrReview({ onChanged }) {
  const [f, setF] = useState({ status: 'submitted', track: '', action: '', vol: '', lowConf: false })
  const [picker, setPicker] = useState(false)
  const query = { section: 'ocr', status: f.status, track: f.track || null, action: f.action || null, vol: f.vol || null, lowConf: f.lowConf ? '1' : null }
  const R = useReview(query, onChanged)
  const items = R.data?.items || []
  const stats = R.data?.stats
  const okInView = items.filter((x) => x.status === 'submitted' && x.result?.action === 'ok').length
  const H = useHandles()
  // 1 אשר · 2 תקן ואשר (עריכה במקום; Enter שומר, Esc מבטל) · 3 / Delete דחה · 4 לא קריא · 5 לנתב
  const K = useRowKeys(items, (key, it) => {
    if (it.status !== 'submitted' || R.busy) return false
    if (key === '1') H.get(it.id)?.approve() // דרך השורה: לא כשהתמונה לא נטענה
    else if (key === '2') H.get(it.id)?.edit()
    else if (key === '3' || key === 'Delete') R.decide([it.id], 'reject')
    else if (MARK_KEYS[key]) H.get(it.id)?.mark(MARK_KEYS[key])
    else return false
    return true
  })

  const defs = [
    { key: 'status', label: 'מצב', options: STATUS_OPTIONS, empty: 'submitted' },
    { key: 'track', label: 'כתב', allLabel: 'כל הכתבים', options: LINE_SCRIPTS.map((s) => ({ value: s, label: SCRIPT_LABELS[s] })) },
    { key: 'action', label: 'מה המתנדב עשה', allLabel: 'הכול', options: OCR_RETURN_ACTIONS.map((a) => ({ value: a, label: ACTION_FILTER[a] })) },
    { key: 'vol', label: 'מתנדב', allLabel: 'כולם', options: (stats?.vols || []).map((v) => ({ value: v.id, label: v.name })) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <ReviewFilters filters={f} defs={defs} onChange={setF} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <Muted className="min-w-0 flex-1 basis-80">השורות מעורבבות מכל הספרים. &quot;הכתב שגוי&quot; לא נכנס לאימון הקריאה — באישור השורה חוזרת לבדיקת סוג הכתב במחשב האימון.</Muted>
        <CheckRow checked={f.lowConf} onChange={(lowConf) => setF((x) => ({ ...x, lowConf }))} className="text-body-sm">
          קודם מה שהמודל פחות בטוח בו
        </CheckRow>
      </div>

      {f.status === 'submitted' && (
        <QuickApprove>
          <Button
            variant="tonal"
            size="sm"
            icon="done_all"
            disabled={R.busy || !stats?.okUnchanged}
            onClick={() =>
              R.bulk('ok-unchanged', {}, {
                title: (n) => `לאשר ${fmt(n)} שורות "נכון"?`,
                message: 'בכל התור (לא רק במסך): כל השורות שהמתנדב סימן "נכון" ולא שינה בהן אף אות. כדאי לעבור קודם על מדגם מהן.',
              })
            }
          >
            כל ה&quot;נכון&quot; שלא שונו ({fmt(okInView)} בתצוגה, {fmt(stats?.okUnchanged)} בכל התור)
          </Button>
          <Button variant="text" size="sm" icon="person" disabled={R.busy || !stats?.vols?.length} onClick={() => setPicker(true)}>
            הכול ממתנדב מסוים…
          </Button>
        </QuickApprove>
      )}

      <KeyHint>
        <Kbd>1</Kbd> אשר · <Kbd>2</Kbd> תקן ואשר (<Kbd>Enter</Kbd> שומר, <Kbd>Esc</Kbd> מבטל) · <Kbd>3</Kbd> או <Kbd>Delete</Kbd> דחה · <Kbd>4</Kbd> לא קריא · <Kbd>5</Kbd> לנתב ·{' '}
        <Kbd>↓</Kbd>/<Kbd>↑</Kbd> שורה אחרת
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
          <OcrRow
            key={it.id}
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
            onFix={(x, text) => R.fix(x, { action: 'fixed', text })}
            onMark={(x, action) => R.fix(x, { action })}
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
              message: `כל ההגשות הממתינות של ${v.name} בזיהוי-הטקסט, בכל הכתבים.${v.match != null ? ` שיעור-ההתאמה שלו עד היום: ${v.match}%.` : ''}`,
            })
          }}
        />
      )}
    </div>
  )
}

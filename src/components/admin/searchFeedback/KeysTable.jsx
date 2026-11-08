'use client'

import { useEffect, useRef, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import MenuButton from '@/components/ui/MenuButton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import RelativeTime from '@/components/ui/RelativeTime'
import { errorToast, requestJson } from '@/components/admin/list/adminRequest'
import { formatNumber } from '@/lib/adminTerms'
import { isBlocked, keyActionUrl, keyStatusLabel, shortKeyId } from '@/lib/adminSearchFeedbackScreen/searchFeedbackTerms'

const TH = 'px-3 py-2 text-start text-label-md font-normal text-on-surface-variant'
const TD = 'px-3 py-3 align-middle'

/**
 * לשונית "התקנות": ההתקנות ששלחו הכי הרבה משוב. התקנה פעילה — "חסום התקנה" גלוי (עם אישור); חסומה — "בטל חסימה"
 * בתפריט ⋮ של השורה. אותן בקשות כמו קודם: POST …/keys/[keyId]/block|unblock, בלי גוף. onChanged — אחרי שינוי מוצלח.
 * הבקשה דרך requestJson: התחברות שפגה / שבת / תשובה שאינה JSON — שגיאה (עם "התחבר" כשצריך), לא "ההתקנה נחסמה".
 * פוקוס: הכפתור "כבוי" ב-softDisabled בזמן הבקשה; אחרי השינוי השורה מתחלפת (כפתור ↔ ⋮), ולכן הפוקוס עובר לפעולה
 * החדשה של אותה שורה כשהנתונים המעודכנים מגיעים (ואם השורה כבר לא ברשימה — לטבלה).
 */
export default function KeysTable({ keys, onChanged }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [busyKey, setBusyKey] = useState(null)
  const tableRef = useRef(null)
  const focusAfterChange = useRef(null)

  useEffect(() => {
    const keyId = focusAfterChange.current
    if (!keyId || !tableRef.current) return
    focusAfterChange.current = null
    const cell = [...tableRef.current.querySelectorAll('[data-key-actions]')].find((el) => el.dataset.keyActions === keyId)
    const target = cell?.querySelector('button') || tableRef.current
    target.focus()
  }, [keys])

  const run = async (key, action) => {
    if (busyKey) return
    if (action === 'block') {
      const ok = await confirm({
        title: 'לחסום את ההתקנה?',
        body: 'ההתקנה תפסיק לשלוח משוב, והאירועים שלה לא ייכללו בהורדה. אפשר לבטל את החסימה אחר כך.',
        confirmLabel: 'חסום התקנה',
      })
      if (!ok) return
    }
    setBusyKey(key.keyId)
    try {
      await requestJson(keyActionUrl(key.keyId, action), { method: 'POST', fallback: 'לא הצלחנו לעדכן את ההתקנה.' })
      toast.show({ message: action === 'block' ? 'ההתקנה נחסמה' : 'החסימה בוטלה' })
      focusAfterChange.current = key.keyId
      onChanged()
    } catch (err) {
      toast.show(errorToast(err, 'לא הצלחנו לעדכן את ההתקנה.'))
    } finally {
      setBusyKey(null)
    }
  }

  if (keys.length === 0) {
    return <EmptyState icon="devices" title="אין התקנות רשומות" description="התקנות יופיעו כאן אחרי שישלחו משוב מהחיפוש." />
  }

  return (
    <div ref={tableRef} tabIndex={-1} className={cardClasses({ className: 'overflow-x-auto outline-none' })}>
      <table className="w-full min-w-[44rem] text-body-md">
        <caption className="sr-only">ההתקנות ששלחו הכי הרבה משוב</caption>
        <thead className="border-b border-outline-variant">
          <tr>
            <th scope="col" className={TH}>מזהה</th>
            <th scope="col" className={TH}>תוכנה</th>
            <th scope="col" className={TH}>גרסה</th>
            <th scope="col" className={TH}>אירועים</th>
            <th scope="col" className={TH}>נראתה לאחרונה</th>
            <th scope="col" className={TH}>מצב</th>
            <th scope="col" className={TH}><span className="sr-only">פעולות</span></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const blocked = isBlocked(k)
            const busy = busyKey === k.keyId
            return (
              <tr key={k.keyId} className="border-b border-outline-variant last:border-0">
                <td className={`${TD} font-mono text-body-sm`} dir="ltr" title={k.keyId}>{shortKeyId(k.keyId)}</td>
                <td className={TD}><bdi dir="ltr">{k.app} / {k.platform}</bdi></td>
                <td className={TD}><bdi dir="ltr">{k.appVersionLast}</bdi></td>
                <td className={`${TD} tabular-nums`}>{formatNumber(k.eventCount)}</td>
                <td className={`${TD} text-on-surface-variant`}>{k.lastSeenAt ? <RelativeTime date={k.lastSeenAt} /> : '—'}</td>
                <td className={TD}><Badge tone={blocked ? 'error' : 'neutral'}>{keyStatusLabel(k)}</Badge></td>
                <td className={`${TD} w-px whitespace-nowrap text-end`} data-key-actions={k.keyId}>
                  {blocked ? (
                    <MenuButton
                      label={`עוד פעולות להתקנה ${shortKeyId(k.keyId)}`}
                      items={[{ id: 'unblock', icon: 'lock_open', label: 'בטל חסימה', disabled: Boolean(busyKey), onSelect: () => run(k, 'unblock') }]}
                    />
                  ) : (
                    <Button variant="text" size="sm" icon="block" softDisabled={Boolean(busyKey)} onClick={() => run(k, 'block')} aria-label={`חסום את ההתקנה ${shortKeyId(k.keyId)}`}>
                      {busy ? 'חוסם…' : 'חסום התקנה'}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {confirmElement}
    </div>
  )
}

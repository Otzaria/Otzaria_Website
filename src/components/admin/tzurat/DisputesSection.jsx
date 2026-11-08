'use client'

import { useState } from 'react'
import ErrorState from '@/components/ui/ErrorState'
import Pager from '@/components/ui/Pager'
import { bookOptions, ITEM_STATUS_ORDER, statusOptions, totalAfterChange, totalText } from '@/lib/adminTzuratScreen/tzuratTerms'
import { query } from './adminApi'
import { KIND_LABEL } from './adminLabels'
import ItemCard from './ItemCard'
import EmptyText from '@/components/ui/EmptyText'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'
import RefreshButton from '@/components/ui/RefreshButton'
import { FILTER_WIDTH, FilterSelect } from './TzuratBits'
import useAdminData from './useAdminData'

// לשונית "מחלוקות": החלטות הנוסח לפי מצב (ברירת מחדל: במחלוקת), מסכת וסוג גוש, עם עימוד — אותה בקשה כמו קודם:
// GET items?status=&slug=&kind=&page= → {items, total, page, pages}. רשימת המסכתות לבורר — GET batches. ההכרעה עצמה —
// ItemCard. אחרי הכרעה הכרטיס נשאר במקומו (גם כשהוא כבר לא "במחלוקת"), כדי שהרשימה לא תקפוץ; "רענן" מסדר מחדש.
// הסה"כ והמונה בלשונית יורדים מקומית (onChanged('item', מצב קודם, מצב חדש) — בלי בקשה לשרת).

const STATUS_OPTIONS = statusOptions('item', ITEM_STATUS_ORDER)
const KIND_OPTIONS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))

/** @param {{ onChanged?: (kind: 'item', from: string, to: string) => void }} props */
export default function DisputesSection({ onChanged }) {
  const [status, setStatus] = useState('disputed')
  const [slug, setSlug] = useState('all')
  const [kind, setKind] = useState('all')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload: load, setData } = useAdminData(`items${query({ status, slug, kind, page })}`)
  const batches = useAdminData('batches').data

  const filter = (setter) => (v) => {
    setter(v)
    setPage(1)
  }

  const replace = (item, from) => {
    setData((d) => ({ ...d, total: totalAfterChange(d.total, status, from, item.status), items: d.items.map((x) => (x.id === item.id ? item : x)) }))
    onChanged?.('item', from, item.status)
  }
  const items = data?.items || []

  return (
    <div className="flex flex-col gap-4" data-testid="disputes">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto sm:flex-wrap">
          <FilterSelect label="מצב" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} className={FILTER_WIDTH} />
          <FilterSelect label="מסכת" value={slug} onChange={filter(setSlug)} options={bookOptions(batches)} allLabel="כל המסכתות" className={FILTER_WIDTH} />
          <FilterSelect label="סוג" value={kind} onChange={filter(setKind)} options={KIND_OPTIONS} allLabel="כל הסוגים" className={FILTER_WIDTH} />
        </div>
        <span className="flex-1" />
        {data && <span className="text-body-sm text-on-surface-variant" role="status">{totalText(data.total ?? 0, 'החלטה אחת', 'החלטות')}</span>}
        <RefreshButton onClick={load} busy={loading} />
      </div>
      {error && data && <ErrorNotice text={error} />}
      {error && !data ? (
        <ErrorState title="לא הצלחנו לטעון את ההחלטות" description={error} onRetry={load} />
      ) : !data ? (
        <ListLoading />
      ) : !items.length ? (
        <EmptyText>{status === 'disputed' ? 'אין מחלוקות פתוחות' : 'אין החלטות במצב הזה'}</EmptyText>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => <ItemCard key={item.id} item={item} onChange={replace} />)}
        </div>
      )}
      {(data?.pages || 1) > 1 && <Pager page={data?.page || page} pageCount={data.pages} onChange={setPage} label="מעבר בין עמודי ההחלטות" className="self-center" />}
    </div>
  )
}

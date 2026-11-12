'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import Chip from '@/components/ui/Chip'

/**
 * סרגל הסינון של "נכנסות" ו"נשלחו": חיפוש (שולח, נמען, נושא או טקסט; מקש "/" מתמקד בו), וב"נכנסות" — הצ'יפ
 * "רק חדשות" עם המספר. שורה אחת גם בטלפון — list/FilterBar בלי בוררים (אין מה לקפל).
 *
 * @param {{ q: string, onSearch: (q: string) => void, placeholder: string,
 *   onlyNew?: boolean, newCount?: number, onOnlyNewChange?: (next: boolean) => void }} props
 */
export default function MessagesFilterBar({ q, onSearch, placeholder, onlyNew, newCount, onOnlyNewChange }) {
  return (
    <FilterBar
      search={{ label: 'חיפוש בהודעות', placeholder, value: q, onSearch }}
      aside={onOnlyNewChange && (
        <Chip selected={Boolean(onlyNew)} count={newCount} onClick={() => onOnlyNewChange(!onlyNew)} className="mb-1.5">
          רק חדשות
        </Chip>
      )}
    />
  )
}

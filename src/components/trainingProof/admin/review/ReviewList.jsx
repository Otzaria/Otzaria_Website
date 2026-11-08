'use client'

import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'

// הרשימה של הסקירה (זיהוי טקסט ונתב הכתב): שלד בטעינה, שגיאה, "אין שורות", ושורות-כרטיסים זו מתחת לזו.
// data — מ-useReview (null עד שנטען); count — כמה שורות בתצוגה. empty — מה לכתוב כשאין שורות
// (filterState.emptyView), onClear — "נקה סינון" כשהריקנות בגלל הסינון.
export default function ReviewList({ data, count, empty, onClear, children }) {
  if (!data) return <ListLoading rows={3} label="טוען את השורות…" />
  return (
    <div className="flex flex-col gap-3">
      <ErrorNotice text={data.error} />
      {!data.error && !count && (
        <EmptyState
          icon={empty?.canClear ? 'filter_alt_off' : 'task_alt'}
          title={empty?.title || 'אין שורות בתצוגה הזו'}
          description={empty?.description}
          actions={empty?.canClear && onClear ? <Button variant="outlined" size="sm" icon="filter_alt_off" onClick={onClear}>נקה סינון</Button> : null}
        />
      )}
      {count > 0 && (
        <ul aria-label="השורות" className="flex flex-col gap-3">
          {children}
        </ul>
      )}
    </div>
  )
}

// "אישור מהיר" — פעולות על כל התור (לא רק על המסך)
export function QuickApprove({ children }) {
  return (
    <div role="group" aria-label="אישור מהיר" className="flex flex-wrap items-center gap-2">
      <span className="text-label-md text-on-surface-variant">אישור מהיר:</span>
      {children}
    </div>
  )
}

import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'

/**
 * המצבים הריקים של המסך (uploadTerms.emptyStateKind):
 *   queue-clear — אין העלאות שלא נבדקו (חיובי, task_alt)
 *   no-match    — יש העלאות, אבל הסינון לא מצא — עם "נקה סינון" (role="status": תוצאה של פעולה)
 *   trash-empty — האשפה ריקה
 */
export default function UploadsEmptyState({ kind, total, onClearFilters, hasStatusFilter }) {
  if (kind === 'trash-empty') {
    return (
      <EmptyState
        icon="delete_outline"
        title="האשפה ריקה"
        description="העלאות שמוחקים מגיעות לכאן. אפשר לשחזר אותן עד שמוחקים אותן לצמיתות."
      />
    )
  }
  if (kind === 'queue-clear') {
    return (
      <EmptyState
        icon="task_alt"
        title={total === 0 ? 'אין העלאות' : 'אין העלאות שלא נבדקו'}
        description={total === 0 ? 'כשמשתמש ישלח ספר או עמוד, הוא יופיע כאן.' : 'כל ההעלאות כבר נבדקו.'}
        actions={total > 0 && hasStatusFilter
          ? <Button variant="outlined" size="sm" onClick={onClearFilters}>הצג את כל ההעלאות</Button>
          : undefined}
      />
    )
  }
  return (
    <EmptyState
      role="status"
      icon="search_off"
      title="אין העלאות שמתאימות לסינון"
      description='נסה לחפש שם אחר או להסיר חלק מהסינון. החיפוש הוא בשם הספר; לסינון לפי מי שהעלה — בורר "משתמש".'
      actions={<Button variant="outlined" size="sm" icon="filter_alt_off" onClick={onClearFilters}>נקה סינון</Button>}
    />
  )
}

import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'

/**
 * המצבים הריקים של הרשימה (bookTerms.emptyStateKind):
 *   none     — אין ספרים בכלל — עם "הוסף ספר"
 *   no-match — יש ספרים, אבל הסינון לא מצא — עם "נקה סינון" (role="status": תוצאה של פעולה)
 */
export default function BooksEmptyState({ kind, onClearFilters, onAdd }) {
  if (kind === 'none') {
    return (
      <EmptyState
        icon="menu_book"
        title="אין ספרים"
        description="ספר שתוסיף מקובץ PDF יתחלק לעמודים ויופיע כאן."
        actions={onAdd ? <Button variant="filled" size="sm" icon="add" onClick={onAdd}>הוסף ספר</Button> : undefined}
      />
    )
  }
  return (
    <EmptyState
      role="status"
      icon="search_off"
      title="אין ספרים שמתאימים לסינון"
      description="נסה לחפש שם אחר או להסיר חלק מהסינון. החיפוש הוא בשם הספר ובשם הבעלים."
      actions={<Button variant="outlined" size="sm" icon="filter_alt_off" onClick={onClearFilters}>נקה סינון</Button>}
    />
  )
}

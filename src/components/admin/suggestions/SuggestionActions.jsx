import Button from '@/components/ui/Button'
import { REJECT_PENDING_LINE, partsActionLabel } from '@/lib/adminSuggestions/suggestionTerms'

/**
 * שורת הפעולות בתחתית כרטיס הצעה — שורה אחת, באותו מקום, לפי המצב:
 *   רגיל — "אשר" (טונלי, הראשי) ו"דחה" (מסגרת — כפתור משני אמיתי, לא "ביטול"). בהצעה עם כמה חלקים —
 *     "אשר הכול" / "דחה הכול". הצעה בלי חלקים — רק "דחה" (אין מה לאשר).
 *   מסומנים חלקים — במקומם: "אשר 2 חלקים", "דחה 2 חלקים" ו"נקה בחירה" (לא שורה נוספת מעל).
 *   דחייה ממתינה — "ההצעה תידחה בעוד כמה שניות" ו"בטל".
 * disabled — aria-disabled (Button softDisabled): הכפתור שבפוקוס לא מאבד אותו בזמן בקשה.
 *
 * @param {{ name: string, many: boolean, empty: boolean, parts: number, rejecting: boolean, disabled: boolean,
 *   onApprove: () => void, onReject: () => void, onCancelReject: () => void, onParts: (kind: 'approve' | 'reject') => void,
 *   onClearParts: () => void }} props
 */
export default function SuggestionActions({ name, many, empty, parts, rejecting, disabled, onApprove, onReject, onCancelReject, onParts, onClearParts }) {
  const row = 'flex flex-wrap items-center gap-2'
  if (rejecting) {
    return (
      <div data-card-actions="" className={row}>
        <Button data-cancel-reject="" variant="outlined" size="sm" icon="undo" onClick={onCancelReject} aria-label={`בטל את הדחייה: ההצעה ל${name}`}>בטל דחייה</Button>
        <p className="text-body-sm text-on-surface-variant">{REJECT_PENDING_LINE}</p>
      </div>
    )
  }
  if (parts > 0) {
    return (
      <div data-card-actions="" role="group" aria-label={`פעולות על החלקים שנבחרו: ההצעה ל${name}`} className={row}>
        <Button variant="tonal" size="sm" icon="check" softDisabled={disabled} onClick={() => onParts('approve')}>{partsActionLabel('approve', parts)}</Button>
        <Button variant="outlined" size="sm" icon="close" softDisabled={disabled} onClick={() => onParts('reject')}>{partsActionLabel('reject', parts)}</Button>
        <Button variant="text" size="sm" onClick={onClearParts}>נקה בחירה</Button>
      </div>
    )
  }
  return (
    <div data-card-actions="" className={row}>
      {!empty && (
        <Button variant="tonal" size="sm" icon="check" softDisabled={disabled} onClick={onApprove} aria-label={`${many ? 'אשר הכול' : 'אשר'}: ההצעה ל${name}`}>
          {many ? 'אשר הכול' : 'אשר'}
        </Button>
      )}
      <Button data-reject="" variant="outlined" size="sm" icon="close" softDisabled={disabled} onClick={onReject} aria-label={`${many ? 'דחה הכול' : 'דחה'}: ההצעה ל${name}`}>
        {many ? 'דחה הכול' : 'דחה'}
      </Button>
    </div>
  )
}
